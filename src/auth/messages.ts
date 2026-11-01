/**
 * @file messages.ts
 * @description Textos de error del login compartidos por la pantalla y los servicios de autenticación.
 */

import type { UserRole } from '../types';

/** Mensaje cuando la cuenta es de un perfil y se ha entrado por la tarjeta del otro. */
export const roleMismatchMessage = (accountRole: UserRole): string =>
  accountRole === 'young'
    ? 'Esta cuenta pertenece a un perfil de Jóvenes.'
    : 'Esta cuenta pertenece a un perfil de Empresa.';
