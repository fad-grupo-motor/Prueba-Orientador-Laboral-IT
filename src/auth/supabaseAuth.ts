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
import type { AuthService } from './authService';

/** Role clicked before going to Google; read and removed when coming back. */
const PENDING_ROLE_KEY = 'orientador_pending_oauth_role';

type DbRole = 'talent' | 'company';

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

  /** Error of the last return from Google, shown once by the login screen. */
  let redirectError: { role: UserRole; message: string } | null = null;

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
        console.error('[auth] signUp failed:', error.code, error.message);
        if (error.code === 'user_already_exists') {
          return { user: null, error: 'Ya hay una cuenta con este correo. Inicia sesión.' };
        }
        if (error.code === 'weak_password') {
          return { user: null, error: 'La contraseña es demasiado débil. Usa al menos 8 caracteres y evita las muy comunes.' };
        }
        if (error.code === 'over_email_send_rate_limit' || error.code === 'email_address_not_authorized') {
          return { user: null, error: 'Ahora mismo no podemos crear cuentas con correo. Prueba con Google.' };
        }
        return { user: null, error: 'No se ha podido crear la cuenta. Inténtalo de nuevo.' };
      }
      // With "Confirm email" on in Supabase there is no session until the email link is opened.
      if (!data.session || !data.user) {
        return { user: null, error: 'Te hemos enviado un correo para confirmar la cuenta. Ábrelo y vuelve a entrar.' };
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

    getRedirectError() {
      return redirectError;
    },

    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) console.error('[auth] signOut failed:', error.message);
    },

    async getSession() {
      // On the way back from Google the client first swaps the "?code=" in the URL for a session.
      const { data, error } = await supabase.auth.getSession();
      if (error) console.error('[auth] getSession failed:', error.message);
      if (!data.session) {
        clearPendingRole();
        return null;
      }
      return toSession(data.session.user);
    }
  };
}
