/**
 * @file LoginScreen.tsx
 * @description Pantalla de acceso: elección de perfil (Jóvenes / Empresas) con giro 3D de tarjeta
 * que revela el formulario de inicio de sesión, sobre un fondo animado que se carga en diferido.
 *
 * En móvil las tarjetas son compactas (sin la lista de ventajas) para que los dos botones
 * "Soy joven" y "Soy empresa" se vean sin desplazarse en una pantalla de 360 × 780.
 */

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Gift, HandCoins, LoaderCircle, ShieldCheck } from 'lucide-react';
import { MIN_PASSWORD_LENGTH, authService, isDemoAuth } from '../../auth/authService';
import { roleMismatchMessage } from '../../auth/messages';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../auth/demoAccounts';
import type { UserRole, UserSession } from '../../types';
import type { BackdropVariant } from './LoginBackdrop';
import { useSmoothCardHeight } from './useSmoothCardHeight';
import type { CardElements } from './useSmoothCardHeight';
import fadLogoUrl from '../../assets/brand/fad-juventud-light.png';

// three.js no debe bloquear el login: el fondo se descarga aparte.
const LoginBackdrop = lazy(() => import('./LoginBackdrop'));

const BACKDROP_STORAGE_KEY = 'it_orientador_login_backdrop';
const FLIP_MS = 600;

const BACKDROP_OPTIONS: { value: BackdropVariant; label: string }[] = [
  { value: 'network', label: 'Red' },
  { value: 'gradient', label: 'Degradado' }
];

/** Franja de confianza bajo el titular. */
const TRUST_SEALS = [
  { icon: Gift, label: 'Gratuito' },
  { icon: HandCoins, label: 'Sin comisiones' },
  { icon: ShieldCheck, label: 'Fundación Fad Juventud' }
];

interface RoleCardContent {
  role: UserRole;
  title: string;
  description: string;
  features: string[];
  cta: string;
  accessLabel: string;
}

const ROLE_CARDS: RoleCardContent[] = [
  {
    role: 'young',
    title: 'Jóvenes y candidatos',
    description: 'Si buscas tu primer trabajo o vienes de otro sector y quieres cambiar de rumbo.',
    features: ['Descubre lo que ya sabes hacer', 'Tu plan paso a paso y tu CV', 'Ofertas con el salario a la vista', 'Practica entrevistas de trabajo', 'Cursos recomendados para ti'],
    cta: 'Soy joven',
    accessLabel: 'Acceso · Jóvenes'
  },
  {
    role: 'company',
    title: 'Empresas y organizaciones',
    description: 'Talento joven de forma ética: contacto directo con las personas candidatas, sin intermediarios ni comisiones.',
    features: ['Publicad vacantes con el salario visible', 'Candidaturas anónimas hasta abrir el contacto', 'Cifras de impacto de vuestras contrataciones'],
    cta: 'Soy empresa',
    accessLabel: 'Acceso · Empresas'
  }
];

/** Logotipo de Google (la "G" de cuatro colores) para el botón de acceso. */
function GoogleIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Lee el fondo guardado; si el almacenamiento falla, usa la red. */
function readStoredBackdrop(): BackdropVariant {
  try {
    const stored = window.localStorage.getItem(BACKDROP_STORAGE_KEY);
    return stored === 'gradient' || stored === 'network' ? stored : 'network';
  } catch {
    return 'network';
  }
}

export default function LoginScreen({ onLogin }: { onLogin: (user: UserSession) => void }) {
  // Al volver de Google con un error (p. ej. cuenta de joven por la tarjeta de empresa), la pantalla
  // abre la tarjeta elegida con el mensaje.
  const [redirectError] = useState(() => authService.getRedirectError?.() ?? null);

  // Perfil del formulario. Se conserva mientras la tarjeta gira de vuelta para que no "salte" el contenido.
  const [formRole, setFormRole] = useState<UserRole | null>(redirectError?.role ?? null);
  const [isFlipped, setIsFlipped] = useState<boolean>(Boolean(redirectError?.role));

  // "Crear cuenta" solo existe con Supabase; con las cuentas demo o la API solo se puede entrar.
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp' | 'reset'>('signIn');
  /** "Recuperar contraseña": el enlace ya se ha pedido. */
  const [resetSent, setResetSent] = useState<boolean>(false);
  const [signUpName, setSignUpName] = useState<string>('');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);
  // Error con tarjeta (p. ej. Google): se ve dentro del formulario. Sin tarjeta (enlace de correo
  // caducado): se ve encima de las tarjetas.
  const [authError, setAuthError] = useState<string>(redirectError?.role ? redirectError.message : '');
  const linkError = redirectError && !redirectError.role ? redirectError.message : '';

  const [backdrop, setBackdrop] = useState<BackdropVariant>(readStoredBackdrop);

  // Card elements per role, so the flipped card's height can grow and shrink smoothly.
  const cardsRef = useRef(new Map<string, CardElements>());
  const cardRef = (role: UserRole, part: keyof CardElements) => (el: HTMLElement | null): void => {
    const card = cardsRef.current.get(role) ?? { grid: null, front: null, back: null };
    card[part] = el;
    cardsRef.current.set(role, card);
  };
  useSmoothCardHeight(cardsRef, formRole, isFlipped, FLIP_MS, `${authMode}|${authError}|${resetSent}`);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const timersRef = useRef<number[]>([]);

  /** Programa un temporizador que se limpia al desmontar. */
  const schedule = useCallback((fn: () => void, ms: number): void => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(id => window.clearTimeout(id));
  }, []);

  /** Elige perfil: gira la tarjeta correspondiente y lleva el foco al correo. */
  const handleChooseRole = (role: UserRole, e: ReactMouseEvent<HTMLButtonElement>): void => {
    openerRef.current = e.currentTarget;
    if (formRole !== role) {
      setAuthError('');
      setAuthPassword('');
      setShowPassword(false);
    }
    setFormRole(role);
    setIsFlipped(true);
    schedule(() => emailInputRef.current?.focus({ preventScroll: true }), 300);
  };

  /** Vuelve a la selección de perfil limpiando el formulario y devolviendo el foco. */
  const handleBackToRoles = useCallback((): void => {
    setIsFlipped(false);
    setAuthMode('signIn');
    setResetSent(false);
    setAuthError('');
    setAuthPassword('');
    setShowPassword(false);
    schedule(() => openerRef.current?.focus({ preventScroll: true }), 50);
  }, [schedule]);

  // Escape también deshace el giro.
  useEffect(() => {
    if (!isFlipped) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleBackToRoles();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isFlipped, handleBackToRoles]);

  // Al terminar el giro de vuelta se descarta el perfil del formulario.
  useEffect(() => {
    if (isFlipped || formRole === null) return;
    const id = window.setTimeout(() => setFormRole(null), FLIP_MS);
    return () => window.clearTimeout(id);
  }, [isFlipped, formRole]);

  /**
   * Valida las credenciales contra el servicio de autenticación.
   * El rol lo determina la cuenta; si no coincide con el perfil elegido se rechaza el acceso.
   */
  const handleAuthSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setAuthError('');

    if (authMode === 'signUp') {
      await handleSignUp();
      return;
    }

    if (!authEmail.trim() || !authPassword) {
      setAuthError('Por favor introduce tu correo y contraseña.');
      return;
    }

    setIsSubmittingAuth(true);
    const { user, error } = await authService.signIn(authEmail, authPassword);
    setIsSubmittingAuth(false);

    if (!user) {
      setAuthError(error);
      return;
    }

    if (user.role !== formRole) {
      await authService.signOut();
      setAuthError(roleMismatchMessage(user.role));
      return;
    }

    setAuthPassword('');
    onLogin(user);
  };

  /** Crea la cuenta con el rol de la tarjeta elegida y, si va bien, entra directamente. */
  const handleSignUp = async (): Promise<void> => {
    if (!formRole || !authService.signUp) return;

    if (!signUpName.trim() || !authEmail.trim() || !authPassword) {
      setAuthError('Rellena todos los campos para crear la cuenta.');
      return;
    }
    if (authPassword.length < MIN_PASSWORD_LENGTH) {
      setAuthError(`La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    setIsSubmittingAuth(true);
    const { user, error } = await authService.signUp({
      name: signUpName,
      email: authEmail,
      password: authPassword,
      role: formRole
    });
    setIsSubmittingAuth(false);

    if (!user) {
      setAuthError(error);
      return;
    }
    setAuthPassword('');
    onLogin(user);
  };

  /** Abre "Recuperar contraseña" en la misma tarjeta, conservando el correo ya escrito. */
  const openPasswordReset = (): void => {
    setAuthMode('reset');
    setResetSent(false);
    setAuthError('');
    setAuthPassword('');
    setShowPassword(false);
  };

  const closePasswordReset = (): void => {
    setAuthMode('signIn');
    setResetSent(false);
    setAuthError('');
  };

  /** Pide el enlace. El mensaje de éxito no dice si el correo tiene cuenta (no revela quién está registrado). */
  const handleResetSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setAuthError('');
    if (!authService.requestPasswordReset) return;
    if (!authEmail.trim()) {
      setAuthError('Escribe el correo de tu cuenta.');
      return;
    }

    setIsSubmittingAuth(true);
    const { error } = await authService.requestPasswordReset(authEmail);
    setIsSubmittingAuth(false);

    if (error) {
      setAuthError(error);
      return;
    }
    setResetSent(true);
  };

  /** Cambia entre "Iniciar sesión" y "Crear cuenta" sin perder el correo escrito. */
  const toggleAuthMode = (): void => {
    setAuthMode(prev => (prev === 'signIn' ? 'signUp' : 'signIn'));
    setAuthError('');
    setAuthPassword('');
    setShowPassword(false);
  };

  /**
   * Entrar con Google: el rol es el de la tarjeta elegida. La web sale hacia Google y, al volver,
   * App recupera la sesión con ese rol (ver src/auth/supabaseAuth.ts).
   */
  const handleGoogleSignIn = async (): Promise<void> => {
    if (!formRole || !authService.signInWithGoogle) return;
    setAuthError('');
    setIsSubmittingAuth(true);
    const { error } = await authService.signInWithGoogle(formRole);
    // Si todo va bien el navegador ya se está yendo a Google: el botón sigue en "Abriendo…".
    if (error) {
      setIsSubmittingAuth(false);
      setAuthError(error);
    }
  };

  /** Cambia el fondo y lo recuerda en este navegador. */
  const handleBackdropChange = (variant: BackdropVariant): void => {
    setBackdrop(variant);
    try {
      window.localStorage.setItem(BACKDROP_STORAGE_KEY, variant);
    } catch {
      // Sin almacenamiento disponible: el cambio solo dura esta visita.
    }
  };

  // Gira siempre la tarjeta elegida: el formulario aparece donde se ha pulsado, también en escritorio.
  // En escritorio la otra tarjeta se atenúa, pero sigue a mano para cambiar de perfil.
  const flippedSlot: UserRole | null = formRole;
  const demoEmail = isDemoAuth ? DEMO_ACCOUNTS.find(account => account.role === formRole)?.email : undefined;
  const formCard = ROLE_CARDS.find(card => card.role === formRole);
  const canSignUp = Boolean(authService.signUp);
  const isSignUp = canSignUp && authMode === 'signUp';
  const canResetPassword = Boolean(authService.requestPasswordReset);

  /** "¿Has olvidado tu contraseña?": pide el correo y manda el enlace para elegir una nueva. */
  const renderResetForm = (): ReactNode => (
    <>
      <h2 className="font-display font-bold text-xl tracking-[-0.015em] text-fg">Recuperar contraseña</h2>
      <p className="text-body text-fg-2 mt-1 mb-4">
        Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.
      </p>

      {authError && (
        <div role="alert" className="alert alert-danger mb-3">
          <p>{authError}</p>
        </div>
      )}

      {resetSent ? (
        <div role="status" className="alert alert-ok mb-3">
          <p>
            Si hay una cuenta con <strong className="break-all">{authEmail.trim()}</strong>, te llegará un
            correo en unos minutos. Revisa también la carpeta de correo no deseado.
          </p>
        </div>
      ) : (
        <form onSubmit={handleResetSubmit} className="space-y-3" noValidate>
          <div>
            <label htmlFor="reset-email" className="label-tech">Correo electrónico</label>
            <input
              id="reset-email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="usuario@ejemplo.com"
              className="input-technical"
            />
          </div>
          <button type="submit" disabled={isSubmittingAuth} className="btn btn-primary w-full">
            {isSubmittingAuth && <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />}
            <span>{isSubmittingAuth ? 'Enviando…' : 'Enviar enlace'}</span>
          </button>
        </form>
      )}

      <p className="text-body text-fg-2 text-center mt-3">
        <button
          type="button"
          onClick={closePasswordReset}
          className="min-h-11 font-semibold text-accent-strong underline underline-offset-2"
        >
          Volver a iniciar sesión
        </button>
      </p>
    </>
  );

  /** Cara trasera con el formulario de acceso para el perfil elegido. */
  const renderLoginForm = (): ReactNode => (
    <>
      {/* "Volver" arriba, junto a la etiqueta: el formulario ocupa menos alto. */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="badge-technical">{formCard?.accessLabel}</span>
        <button
          type="button"
          onClick={handleBackToRoles}
          className="min-h-11 -mr-2 px-2 inline-flex items-center gap-1.5 text-meta font-semibold text-fg-2 hover:text-fg rounded"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Volver
        </button>
      </div>

      {authMode === 'reset' ? renderResetForm() : (
      <>
      <h2 className="font-display font-bold text-xl tracking-[-0.015em] text-fg">
        {isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}
      </h2>
      <p className="text-body text-fg-2 mt-1 mb-4">
        {isSignUp ? 'Es gratis y solo te llevará un minuto.' : 'Introduce tus datos para acceder a tu panel.'}
      </p>

      {authError && (
        <div
          role="alert"
          className="alert alert-danger mb-3"
        >
          <p>{authError}</p>
        </div>
      )}

      {authService.signInWithGoogle && (
        <>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmittingAuth}
            className="btn btn-secondary w-full"
          >
            {isSubmittingAuth ? <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" /> : <GoogleIcon />}
            <span>{isSubmittingAuth ? 'Abriendo Google…' : 'Continuar con Google'}</span>
          </button>
          <div className="flex items-center gap-3 my-3 text-meta text-fg-3" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            o con tu correo
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={handleAuthSubmit} className="space-y-3" noValidate>
        {isSignUp && (
          <div>
            <label htmlFor="auth-name" className="label-tech">
              {formRole === 'company' ? 'Nombre de la empresa' : 'Nombre y apellidos'}
            </label>
            <input
              id="auth-name"
              type="text"
              autoComplete={formRole === 'company' ? 'organization' : 'name'}
              value={signUpName}
              onChange={(e) => setSignUpName(e.target.value)}
              className="input-technical"
            />
          </div>
        )}

        <div>
          <label htmlFor="auth-email" className="label-tech">Correo electrónico</label>
          <input
            ref={emailInputRef}
            id="auth-email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            placeholder="usuario@ejemplo.com"
            className="input-technical"
          />
        </div>

        <div>
          {/* El requisito se ve antes de escribir (no solo como error al enviar), en la línea de la etiqueta. */}
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="auth-password" className="label-tech">Contraseña</label>
            {isSignUp ? (
              <span id="auth-password-hint" className="text-meta text-fg-2">
                Mínimo {MIN_PASSWORD_LENGTH} caracteres
              </span>
            ) : canResetPassword && (
              // Junto al campo de contraseña, donde lo buscan las personas (como en las webs habituales).
              <button
                type="button"
                onClick={openPasswordReset}
                className="text-meta font-semibold text-accent-strong underline underline-offset-2"
              >
                ¿Has olvidado tu contraseña?
              </button>
            )}
          </div>
          <div className="relative">
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              aria-describedby={isSignUp ? 'auth-password-hint' : undefined}
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="••••••••"
              className="input-technical pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword(prev => !prev)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute inset-y-0 right-0 w-11 grid place-items-center text-fg-3 hover:text-fg"
            >
              {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={isSubmittingAuth} className="btn btn-primary w-full">
          {isSubmittingAuth && <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />}
          <span>
            {isSignUp
              ? (isSubmittingAuth ? 'Creando la cuenta…' : 'Crear cuenta')
              : (isSubmittingAuth ? 'Comprobando…' : 'Entrar en la plataforma')}
          </span>
        </button>

        {isSignUp && (
          <p className="text-meta text-fg-2 leading-relaxed">
            Al crear la cuenta aceptas la{' '}
            <a
              href="https://fad.es/politica-privacidad/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-strong underline underline-offset-2"
            >
              política de privacidad
            </a>{' '}
            de Fundación Fad Juventud.
          </p>
        )}

        {canSignUp && (
          <p className="text-body text-fg-2 text-center">
            {isSignUp ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
            <button
              type="button"
              onClick={toggleAuthMode}
              className="min-h-11 font-semibold text-accent-strong underline underline-offset-2"
            >
              {isSignUp ? 'Inicia sesión' : 'Regístrate'}
            </button>
          </p>
        )}
      </form>

      {demoEmail && (
        <div className="mt-6 pt-4 border-t border-line text-meta text-fg-2 leading-relaxed">
          <p>
            Cuenta de prueba: <span className="text-fg font-medium break-all">{demoEmail}</span>
          </p>
          <p className="mt-1">
            Contraseña: <strong className="text-accent-strong font-bold">{DEMO_PASSWORD}</strong>
          </p>
          <button
            type="button"
            onClick={() => {
              setAuthEmail(demoEmail);
              setAuthPassword(DEMO_PASSWORD);
            }}
            className="mt-1 min-h-11 text-meta font-semibold text-accent-strong underline underline-offset-2 cursor-pointer block text-left"
          >
            Rellenar automáticamente con la cuenta de prueba
          </button>
        </div>
      )}
      </>
      )}
    </>
  );

  // overflow-hidden: while the height animates, the taller face is clipped instead of spilling out.
  const faceBase =
    'card-technical bg-surface p-5 md:p-8 flex flex-col overflow-hidden [grid-area:1/1] [backface-visibility:hidden] ' +
    'motion-reduce:transition-opacity motion-reduce:duration-200';

  return (
    <div className="relative isolate min-h-dvh bg-canvas text-fg">
      <Suspense fallback={null}>
        <LoginBackdrop variant={backdrop} focus={isFlipped ? formRole : null} />
      </Suspense>

      <div className="relative z-10 max-w-5xl mx-auto px-4 pt-6 pb-10 md:py-20">

        {/* Encabezado: titular para la persona joven y el texto institucional como subtítulo.
            El velo (fondo del lienzo al 70 % con borde difuminado) evita que la red del fondo cruce el texto. */}
        <header className="relative mb-5 md:mb-12 max-w-3xl">
          <div
            className="absolute -inset-x-4 -inset-y-3 md:-inset-x-8 md:-inset-y-6 -z-10 rounded-dialog bg-canvas/70 shadow-[0_0_40px_24px_color-mix(in_srgb,var(--color-canvas)_70%,transparent)]"
            aria-hidden="true"
          />
          <img
            src={fadLogoUrl}
            alt="Fundación Fad Juventud"
            width={136}
            height={97}
            className="w-[84px] md:w-[136px] h-auto mb-4 md:mb-8"
          />
          <h1 className="font-display font-bold text-[27px] md:text-[44px] leading-[1.08] tracking-[-0.015em] text-fg mb-3 md:mb-4">
            Tu primer empleo, con un plan y sin intermediarios
          </h1>
          <p className="text-body md:text-lead text-fg-2 leading-relaxed max-w-2xl">
            Una iniciativa de Fundación Fad Juventud para acompañar a jóvenes hacia su primer empleo
            y conectar a las organizaciones con talento joven y personas que cambian de sector.
          </p>
          <ul className="mt-4 md:mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Garantías">
            {TRUST_SEALS.map(seal => (
              <li key={seal.label} className="flex items-center gap-1.5 text-meta md:text-body font-semibold text-fg-2">
                <seal.icon className="w-4 h-4 text-fg-3 shrink-0" aria-hidden="true" />
                {seal.label}
              </li>
            ))}
          </ul>
        </header>

        {linkError && (
          <div role="alert" className="alert alert-danger mb-4 max-w-3xl">
            <p>{linkError}</p>
          </div>
        )}

        {/* Tarjetas de perfil con giro 3D */}
        <div className="grid md:grid-cols-2 gap-3 md:gap-4">
          {ROLE_CARDS.map(card => {
            const flipped = isFlipped && flippedSlot === card.role;
            const hasBack = flippedSlot === card.role;
            const selected = isFlipped && formRole === card.role && !flipped;
            // La tarjeta no elegida se atenúa mientras la otra muestra el formulario.
            const dimmed = isFlipped && formRole !== null && formRole !== card.role;

            return (
              <div
                key={card.role}
                className="[perspective:1400px]"
              >
                <div
                  ref={cardRef(card.role, 'grid')}
                  className={
                    'grid h-full [transform-style:preserve-3d] transition-transform duration-[600ms] ' +
                    'ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none motion-reduce:[transform:none] ' +
                    (flipped ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]')
                  }
                >
                  {/* Cara delantera: presentación del perfil */}
                  <article
                    ref={cardRef(card.role, 'front')}
                    inert={flipped}
                    aria-hidden={flipped || undefined}
                    className={
                      faceBase +
                      (flipped ? ' pointer-events-none motion-reduce:opacity-0' : ' motion-reduce:opacity-100') +
                      (selected ? ' border-accent shadow-[inset_0_2px_0_var(--color-accent)]' : '') +
                      // Se atenúa el contenido, no la tarjeta: el fondo animado no se transparenta.
                      (dimmed ? ' *:opacity-55 *:transition-opacity hover:*:opacity-100 focus-within:*:opacity-100' : '')
                    }
                  >
                    <h2 className="font-display font-bold text-lg md:text-xl tracking-[-0.015em] text-fg mb-1 md:mb-2">{card.title}</h2>
                    <p className="text-body text-fg-2 leading-relaxed mb-4 md:mb-5">{card.description}</p>
                    {/* En móvil se esconde para que los dos botones se vean sin desplazarse. */}
                    <ul className="hidden sm:block border-t border-line mb-8">
                      {card.features.map(feature => (
                        <li key={feature} className="flex items-center gap-3 py-2.5 border-b border-line text-body text-fg">
                          <span className="w-2 h-px bg-fg-3 shrink-0" aria-hidden="true" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={(e) => handleChooseRole(card.role, e)}
                      aria-pressed={selected}
                      className={`btn ${card.role === 'young' ? 'btn-primary' : 'btn-secondary'} mt-auto self-start`}
                    >
                      {card.cta}
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </article>

                  {/* Cara trasera: formulario de acceso */}
                  <section
                    ref={cardRef(card.role, 'back')}
                    inert={!flipped}
                    aria-hidden={!flipped || undefined}
                    aria-label={hasBack ? 'Iniciar sesión' : undefined}
                    className={
                      faceBase +
                      ' [transform:rotateY(180deg)] motion-reduce:[transform:none]' +
                      (flipped ? ' motion-reduce:opacity-100' : ' pointer-events-none motion-reduce:opacity-0')
                    }
                  >
                    {hasBack && renderLoginForm()}
                  </section>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="mt-12 md:mt-16 pt-5 border-t border-line flex flex-wrap justify-between gap-2 text-meta text-fg-2">
          <span>Fundación Fad Juventud</span>
          <span>Orientador Laboral</span>
        </footer>
      </div>

      {/* Selector de fondo */}
      <div
        role="group"
        aria-label="Fondo de la pantalla"
        className="relative z-20 w-fit mx-auto mb-8 md:fixed md:m-0 md:bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:right-[calc(env(safe-area-inset-right,0px)+1rem)] flex items-center gap-2 p-1 pl-3 bg-surface border border-line rounded"
      >
        <span className="text-meta text-fg-2">Fondo</span>
        <div className="flex">
          {BACKDROP_OPTIONS.map(option => {
            const active = backdrop === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => handleBackdropChange(option.value)}
                className={
                  'min-h-11 px-3 text-meta rounded transition-colors ' +
                  (active ? 'bg-raised text-fg' : 'text-fg-3 hover:text-fg')
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
