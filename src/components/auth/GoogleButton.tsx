/**
 * @file GoogleButton.tsx
 * @description Botón oficial "Continuar con Google" (Google Identity Services).
 *
 * Google lo pinta dentro de nuestra web y abre su ventana desde orientador.fad.es, así que la persona
 * ve nuestro dominio y no la dirección de Supabase. Google devuelve un token que se canjea por la
 * sesión en `authService.signInWithGoogleIdToken`.
 *
 * Si el script de Google no carga (bloqueador, sin red, falta `VITE_GOOGLE_CLIENT_ID`), se muestra el
 * botón de siempre, que entra por redirección (`authService.signInWithGoogle`).
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { authService } from '../../auth/authService';
import type { UserRole, UserSession } from '../../types';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
/** Google no admite botones de más de 400 px. */
const MAX_BUTTON_WIDTH = 400;

/** Lo mínimo de la API de Google Identity Services que se usa aquí. */
interface GoogleIdentity {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        nonce: string;
        ux_mode: 'popup';
        context: 'signin' | 'signup' | 'use';
        itp_support: boolean;
      }): void;
      renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

/** Carga el script de Google una sola vez para toda la página. */
let gisScript: Promise<GoogleIdentity> | null = null;
const loadGoogleIdentity = (): Promise<GoogleIdentity> => {
  if (gisScript) return gisScript;
  const loading = new Promise<GoogleIdentity>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google);
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error('GIS not available')));
    script.onerror = () => reject(new Error('GIS script failed to load'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    gisScript = null; // se podrá reintentar en otra visita a la tarjeta
    throw error;
  });
  gisScript = loading;
  return loading;
};

/** Nonce aleatorio: a Google se le da cifrado (SHA-256 en hexadecimal) y a Supabase sin cifrar. */
const createNonce = async (): Promise<{ raw: string; hashed: string }> => {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  return { raw, hashed };
};

interface GoogleButtonProps {
  /** Tarjeta elegida: joven o empresa. */
  role: UserRole;
  /** Texto del botón: "Continuar con Google" al entrar o al registrarse. */
  context: 'signin' | 'signup';
  onSignedIn: (user: UserSession) => void;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
  /** Botón de siempre (redirección), por si Google no carga. */
  fallback: ReactNode;
}

export default function GoogleButton({ role, context, onSignedIn, onError, onBusyChange, fallback }: GoogleButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<boolean>(!CLIENT_ID || !authService.signInWithGoogleIdToken);

  // Los manejadores cambian en cada render; el botón de Google se pinta una vez y los lee de aquí.
  const handlers = useRef({ onSignedIn, onError, onBusyChange });
  useEffect(() => {
    handlers.current = { onSignedIn, onError, onBusyChange };
  });

  useEffect(() => {
    if (failed || !CLIENT_ID) return;
    let cancelled = false;

    /** Prepara un intento: nonce nuevo y botón pintado de nuevo (Google no reutiliza el nonce). */
    const setUp = async (): Promise<void> => {
      const google = await loadGoogleIdentity();
      const nonce = await createNonce();
      const container = containerRef.current;
      if (cancelled || !container) return;

      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        nonce: nonce.hashed,
        ux_mode: 'popup',
        context,
        itp_support: true,
        callback: async ({ credential }) => {
          if (!credential || !authService.signInWithGoogleIdToken) return;
          handlers.current.onBusyChange(true);
          const result = await authService.signInWithGoogleIdToken(role, credential, nonce.raw);
          handlers.current.onBusyChange(false);
          if (result.user) {
            handlers.current.onSignedIn(result.user);
            return;
          }
          handlers.current.onError(result.error);
          void setUp(); // listo para otro intento
        }
      });

      container.replaceChildren();
      google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        shape: 'rectangular',
        text: 'continue_with',
        logo_alignment: 'center',
        locale: 'es',
        width: Math.min(container.offsetWidth || MAX_BUTTON_WIDTH, MAX_BUTTON_WIDTH)
      });
    };

    setUp().catch(error => {
      console.error('[auth] Botón de Google no disponible, se usa la redirección:', error);
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [failed, role, context]);

  if (failed) return <>{fallback}</>;

  // Alto fijo (el del botón grande de Google) para que la tarjeta no salte al aparecer el botón.
  return <div ref={containerRef} className="w-full h-11 flex justify-center" />;
}
