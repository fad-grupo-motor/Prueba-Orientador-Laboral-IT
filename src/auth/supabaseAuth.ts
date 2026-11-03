/**
 * @file supabaseAuth.ts
 * @description `AuthService` implementation backed by Supabase Auth (Google and email + password).
 *
 * Google sign-in leaves the page and comes back, so the role chosen on the login screen
 * ("Soy joven" / "Soy empresa") is kept in localStorage before leaving. When the page loads
 * again, `getSession()` reads it and saves it once in the database with `set_initial_role`.
 *
 * Roles: the database says 'talent' / 'company'; the web says 'young' / 'company'.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { UserRole, UserSession } from '../types';
import { roleMismatchMessage } from './messages';
import { clearUserBrowserData } from '../lib/clearUserBrowserData';
import type { AuthService } from './authService';

/** Role clicked before going to Google; read and removed when coming back. */
const PENDING_ROLE_KEY = 'orientador_pending_oauth_role';

type DbRole = 'talent' | 'company';

/**
 * Sign-up with an email that already has an account. Supabase does not say whether that account was
 * created with Google or with email + password, so the text covers both.
 */
const ACCOUNT_EXISTS_MESSAGE =
  'Ya hay una cuenta con este correo. Si la creaste con Google, entra con «Continuar con Google» ' +
  '(después puedes añadir una contraseña en «Mi cuenta»). Si la creaste con correo, inicia sesión ' +
  'o usa «¿Has olvidado tu contraseña?».';

const toDbRole = (role: UserRole): DbRole => (role === 'young' ? 'talent' : 'company');
const fromDbRole = (role: DbRole): UserRole => (role === 'talent' ? 'young' : 'company');

const readPendingRole = (): UserRole | null => {
  try {
    const value = localStorage.getItem(PENDING_ROLE_KEY);
    return value === 'young' || value === 'company' ? value : null;
  } catch {
    return null;
  }
};

const clearPendingRole = (): void => {
  try {
    localStorage.removeItem(PENDING_ROLE_KEY);
  } catch {
    // No storage available: nothing to clear.
  }
};

/**
 * Links in the auth emails (supabase/templates) point to the site with "?token_hash=…&type=…".
 * The web checks that code with Supabase, so the link works on any device, not only in the
 * browser where it was requested.
 */
type EmailLinkType = 'email' | 'recovery' | 'email_change';
const EMAIL_LINK_TYPES: readonly string[] = ['email', 'recovery', 'email_change'];

const readEmailLink = (): { tokenHash: string; type: EmailLinkType } | null => {
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  if (!tokenHash || !type || !EMAIL_LINK_TYPES.includes(type)) return null;
  return { tokenHash, type: type as EmailLinkType };
};

/** Removes the one-time code from the address bar (and from the browser history). */
const clearEmailLinkFromUrl = (): void => {
  const url = new URL(window.location.href);
  url.searchParams.delete('token_hash');
  url.searchParams.delete('type');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
};

const displayName = (user: User): string => {
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  return meta?.full_name || meta?.name || user.email?.split('@')[0] || 'Usuario';
};

export function supabaseAuthService(supabase: SupabaseClient): AuthService {
  /** Role saved in the database for the signed-in user, or null if none yet. */
  const fetchRole = async (): Promise<UserRole | null> => {
    const { data, error } = await supabase.rpc('get_my_role');
    if (error) {
      console.error('[auth] get_my_role failed:', error.message);
      return null;
    }
    return data === 'talent' || data === 'company' ? fromDbRole(data) : null;
  };

  /** Saves the role once. If the user already had one, the database returns that one. */
  const saveRole = async (role: UserRole): Promise<UserRole | null> => {
    const { data, error } = await supabase.rpc('set_initial_role', { p_role: toDbRole(role) });
    if (error) {
      console.error('[auth] set_initial_role failed:', error.message);
      return null;
    }
    return data === 'talent' || data === 'company' ? fromDbRole(data) : null;
  };

  /** Error of the last return to the site (Google or email link), shown by the login screen. */
  let redirectError: { role: UserRole | null; message: string } | null = null;
  /** Signed in from a "reset password" link: the new password is still to be chosen. */
  let recoveryMode = false;
  /** getSession() in progress: React runs effects twice in development, so share the same call. */
  let sessionRequest: Promise<UserSession | null> | null = null;

  /** Builds the web session; null if the user still has no role. */
  const toSession = async (user: User): Promise<UserSession | null> => {
    const existing = await fetchRole();
    const pending = readPendingRole(); // card clicked before going to Google, if any
    clearPendingRole();

    // Account of one profile entering through the other card: reject, like the email form does.
    if (existing && pending && existing !== pending) {
      await supabase.auth.signOut();
      redirectError = { role: pending, message: roleMismatchMessage(existing) };
      return null;
    }

    const role = existing ?? (pending ? await saveRole(pending) : null);
    if (!role) {
      // Signed in but no role could be saved: do not leave a half-open session behind.
      await supabase.auth.signOut();
      if (pending) {
        redirectError = { role: pending, message: 'No hemos podido terminar el registro. Inténtalo de nuevo.' };
      }
      return null;
    }
    return { email: user.email ?? '', name: displayName(user), role };
  };

  return {
    async signIn(email, password) {
      redirectError = null;
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      // Right password but the email was never confirmed: say so (and offer to resend the email).
      if (error?.code === 'email_not_confirmed') {
        return {
          user: null,
          code: 'email_not_confirmed',
          error: 'Aún no has confirmado tu correo. Abre el enlace que te enviamos al registrarte (mira también en correo no deseado).'
        };
      }
      if (error || !data.user) {
        // Same message for unknown email and wrong password: does not reveal which accounts exist.
        return { user: null, error: 'Correo o contraseña incorrectos.' };
      }
      const user = await toSession(data.user);
      if (!user) {
        await supabase.auth.signOut();
        return { user: null, error: 'Tu cuenta no tiene un perfil asignado. Escríbenos para revisarlo.' };
      }
      return { user, error: null };
    },

    async signUp({ name, email, password, role }) {
      redirectError = null;
      // handle_new_user (database) reads initial_role and full_name to create the profile.
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { initial_role: toDbRole(role), full_name: name.trim() } }
      });
      if (error) {
        console.error('[auth] signUp failed:', error.code, error.status, error.message);
        if (error.code === 'user_already_exists') {
          return { user: null, error: ACCOUNT_EXISTS_MESSAGE };
        }
        if (error.code === 'weak_password') {
          return { user: null, error: 'La contraseña es demasiado débil. Usa al menos 8 caracteres y evita las muy comunes.' };
        }
        if (error.code === 'over_email_send_rate_limit' || error.code === 'email_address_not_authorized') {
          return { user: null, error: 'Ahora mismo no podemos crear cuentas con correo. Prueba con Google.' };
        }
        // 500: Supabase could not send the confirmation email (e.g. the SMTP key is wrong).
        if (error.status === 500 || error.code === 'unexpected_failure') {
          return { user: null, error: 'No hemos podido enviar el correo de confirmación. Inténtalo de nuevo en unos minutos o entra con Google.' };
        }
        return { user: null, error: 'No se ha podido crear la cuenta. Inténtalo de nuevo.' };
      }
      // Email that already had an account: with "Confirm email" on, Supabase sends nothing and returns
      // a user with no identities. Say so, instead of "we have sent you an email".
      if (data.user && data.user.identities?.length === 0) {
        return { user: null, error: ACCOUNT_EXISTS_MESSAGE };
      }
      // With "Confirm email" on in Supabase there is no session until the email link is opened.
      if (!data.session || !data.user) {
        return { user: null, error: null, needsConfirmation: true };
      }
      const user = await toSession(data.user);
      if (!user) {
        await supabase.auth.signOut();
        return { user: null, error: 'No hemos podido terminar el registro. Inténtalo de nuevo.' };
      }
      return { user, error: null };
    },

    async signInWithGoogle(role) {
      redirectError = null;
      try {
        localStorage.setItem(PENDING_ROLE_KEY, role);
      } catch {
        return { error: 'Tu navegador no permite guardar datos de la sesión. Revisa la configuración de privacidad.' };
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        // Back to this same site (dev: localhost; prod: orientador.fad.es).
        options: { redirectTo: window.location.origin }
      });
      if (error) {
        clearPendingRole();
        console.error('[auth] Google sign-in failed:', error.message);
        return { error: 'No se ha podido abrir el acceso con Google. Inténtalo de nuevo.' };
      }
      // The browser is now leaving for Google.
      return { error: null };
    },

    async signInWithGoogleIdToken(role, idToken, nonce) {
      redirectError = null;
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce });
      if (error || !data.user) {
        console.error('[auth] signInWithIdToken failed:', error?.code, error?.message);
        return { user: null, error: 'No se ha podido entrar con Google. Inténtalo de nuevo.' };
      }

      // Same rules as the redirect flow: the role is saved once; the other profile's card is rejected.
      const existing = await fetchRole();
      if (existing && existing !== role) {
        await supabase.auth.signOut();
        return { user: null, error: roleMismatchMessage(existing) };
      }
      const finalRole = existing ?? (await saveRole(role));
      if (!finalRole) {
        await supabase.auth.signOut();
        return { user: null, error: 'No hemos podido terminar el registro. Inténtalo de nuevo.' };
      }
      return { user: { email: data.user.email ?? '', name: displayName(data.user), role: finalRole }, error: null };
    },

    getRedirectError() {
      return redirectError;
    },

    async resendConfirmation(email) {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
      if (error) {
        console.error('[auth] resend failed:', error.code, error.message);
        if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
          return { error: 'Acabamos de enviarte un correo. Espera un minuto antes de pedir otro.' };
        }
        return { error: 'No se ha podido reenviar el correo. Inténtalo de nuevo.' };
      }
      return { error: null };
    },

    async requestPasswordReset(email) {
      redirectError = null;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin
      });
      if (error) {
        console.error('[auth] resetPasswordForEmail failed:', error.code, error.message);
        if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
          return { error: 'Has pedido varios enlaces seguidos. Espera un minuto y vuelve a intentarlo.' };
        }
        return { error: 'No se ha podido enviar el correo. Inténtalo de nuevo.' };
      }
      return { error: null };
    },

    isPasswordRecovery() {
      return recoveryMode;
    },

    async updatePassword(password) {
      // has_password: Supabase does not tell the web whether a Google account also has a password.
      const { data, error } = await supabase.auth.updateUser({ password, data: { has_password: true } });
      if (error || !data.user) {
        console.error('[auth] updateUser failed:', error?.code, error?.message);
        if (error?.code === 'same_password') {
          return { user: null, error: 'La contraseña nueva tiene que ser distinta de la anterior.' };
        }
        if (error?.code === 'weak_password') {
          return { user: null, error: 'La contraseña es demasiado débil. Usa al menos 8 caracteres y evita las muy comunes.' };
        }
        return { user: null, error: 'No se ha podido guardar la contraseña. Pide un enlace nuevo e inténtalo otra vez.' };
      }
      recoveryMode = false;
      const user = await toSession(data.user);
      if (!user) return { user: null, error: 'Tu cuenta no tiene un perfil asignado. Escríbenos para revisarlo.' };
      return { user, error: null };
    },

    async getAccount() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        console.error('[auth] getUser failed:', error?.message);
        return null;
      }
      const providers = (data.user.identities ?? []).map(identity => identity.provider);
      const meta = data.user.user_metadata as { has_password?: boolean } | undefined;
      return {
        google: providers.includes('google'),
        hasPassword: providers.includes('email') || meta?.has_password === true
      };
    },

    async updateName(name) {
      const trimmed = name.trim();
      const { data: userData } = await supabase.auth.getUser();
      const role = await fetchRole();
      if (!userData.user || !role) {
        return { user: null, error: 'No se ha podido guardar el nombre. Vuelve a entrar e inténtalo de nuevo.' };
      }

      // The profile row (profiles / companies) and the name shown in the panel (auth metadata).
      const { error: rowError } = role === 'young'
        ? await supabase.from('profiles').update({ first_name: trimmed }).eq('id', userData.user.id)
        : await supabase.from('companies').update({ company_name: trimmed }).eq('id', userData.user.id);
      const { data, error } = await supabase.auth.updateUser({ data: { full_name: trimmed } });
      if (rowError || error || !data.user) {
        console.error('[auth] updateName failed:', rowError?.message, error?.message);
        return { user: null, error: 'No se ha podido guardar el nombre. Inténtalo de nuevo.' };
      }
      return { user: { email: data.user.email ?? '', name: displayName(data.user), role }, error: null };
    },

    async deleteAccount() {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.rpc('delete_my_account');
      if (error) {
        console.error('[auth] delete_my_account failed:', error.message);
        return { error: 'No se ha podido eliminar la cuenta. Inténtalo de nuevo.' };
      }
      if (userData.user?.email) clearUserBrowserData(userData.user.email);
      // The user no longer exists on the server: only clear the session in this browser.
      recoveryMode = false;
      await supabase.auth.signOut({ scope: 'local' });
      return { error: null };
    },

    async signOut() {
      recoveryMode = false;
      const { error } = await supabase.auth.signOut();
      if (error) console.error('[auth] signOut failed:', error.message);
    },

    getSession() {
      sessionRequest ??= (async () => {
        // Link from an auth email: check its one-time code and open the session.
        const link = readEmailLink();
        if (link) {
          clearEmailLinkFromUrl();
          const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
          if (error) {
            console.error('[auth] verifyOtp failed:', error.code, error.message);
            redirectError = { role: null, message: 'El enlace ha caducado o ya se ha usado. Pide uno nuevo.' };
            return null;
          }
          if (link.type === 'recovery') recoveryMode = true;
        }

        // On the way back from Google the client first swaps the "?code=" in the URL for a session.
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error('[auth] getSession failed:', error.message);
        if (!data.session) {
          clearPendingRole();
          return null;
        }
        return toSession(data.session.user);
      })().finally(() => {
        sessionRequest = null;
      });
      return sessionRequest;
    }
  };
}
