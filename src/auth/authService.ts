/**
 * @file authService.ts
 * @description Contrato común de autenticación y selección de la implementación activa.
 *
 * La app solo habla con `authService`, nunca con una implementación concreta.
 * Cuál se usa lo decide `VITE_AUTH_PROVIDER` (supabase | api | demo). Si no se indica:
 * la API en Python si existe `VITE_API_URL`; si no, las cuentas demo.
 */

import type { UserRole, UserSession } from '../types';
import { demoAuthService } from './demoAuth';
import { apiAuthService } from './apiAuth';
import { supabaseAuthService } from './supabaseAuth';
import { supabase } from '../lib/supabaseClient';

export type AuthResult =
  | { user: UserSession; error: null }
  | { user: null; error: string; code?: AuthErrorCode };

/** Errores que la pantalla trata aparte (p. ej. para ofrecer "Reenviar el correo"). */
export type AuthErrorCode = 'email_not_confirmed';

/** Resultado de crear cuenta: entra directamente, o (con "Confirm email") tiene que confirmar el correo. */
export type SignUpResult = AuthResult | { user: null; error: null; needsConfirmation: true };

export interface SignUpInput {
  /** Nombre de la persona o de la empresa, según el rol. */
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

/** Longitud mínima de contraseña. Debe coincidir con la de Supabase (Authentication → Email). */
export const MIN_PASSWORD_LENGTH = 8;

export interface AuthService {
  /** Valida credenciales y, si son correctas, persiste la sesión. */
  signIn(email: string, password: string): Promise<AuthResult>;
  /**
   * Crear cuenta con correo y contraseña (solo Supabase). Si va bien, deja la sesión iniciada
   * con el rol de la tarjeta elegida.
   */
  signUp?(input: SignUpInput): Promise<SignUpResult>;
  /** Vuelve a enviar el correo "Confirma tu cuenta" (solo Supabase). */
  resendConfirmation?(email: string): Promise<{ error: string | null }>;
  /**
   * Entrar con Google (solo Supabase). Sale de la web hacia Google y vuelve; al volver,
   * `getSession()` devuelve la sesión con el rol elegido.
   */
  signInWithGoogle?(role: UserRole): Promise<{ error: string | null }>;
  /**
   * Entrar con el botón oficial de Google (solo Supabase): Google devuelve un token sin salir de la web
   * y aquí se canjea por la sesión, con el rol de la tarjeta elegida. `nonce` es el valor sin cifrar.
   */
  signInWithGoogleIdToken?(role: UserRole, idToken: string, nonce: string): Promise<AuthResult>;
  /**
   * Error de la última vuelta a la web (desde Google o desde un enlace de correo), con la tarjeta
   * que se había elegido si se sabe (`role: null` si no). Leerlo no lo borra (React en modo
   * estricto lee dos veces); se borra en el siguiente intento de entrar.
   */
  getRedirectError?(): { role: UserRole | null; message: string } | null;
  /**
   * Envía el correo para elegir una contraseña nueva (solo Supabase). Por seguridad no dice si el
   * correo tiene cuenta: solo devuelve error si no se ha podido enviar.
   */
  requestPasswordReset?(email: string): Promise<{ error: string | null }>;
  /** True si se ha entrado desde el enlace de "restablecer contraseña": falta elegir la nueva. */
  isPasswordRecovery?(): boolean;
  /** Guarda la contraseña nueva de la persona que ha entrado desde el enlace de recuperación. */
  updatePassword?(password: string): Promise<AuthResult>;
  /** Elimina la sesión activa. */
  signOut(): Promise<void>;
  /** Devuelve la sesión guardada si sigue siendo válida. */
  getSession(): Promise<UserSession | null>;
}

const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');
const provider = import.meta.env.VITE_AUTH_PROVIDER ?? (apiUrl ? 'api' : 'demo');

const pickService = (): AuthService => {
  if (provider === 'supabase') {
    if (supabase) return supabaseAuthService(supabase);
    console.error('[auth] VITE_AUTH_PROVIDER=supabase, pero faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY: se usan las cuentas demo.');
  }
  if (provider === 'api' && apiUrl) return apiAuthService(apiUrl);
  return demoAuthService;
};

export const authService: AuthService = pickService();

/** True cuando se usan las cuentas demo: la pantalla de login enseña la cuenta de prueba. */
export const isDemoAuth = authService === demoAuthService;
