/**
 * @file AccountSettings.tsx
 * @description Pestaña "Mi cuenta" (joven y empresa): datos, acceso, sesión y eliminar la cuenta.
 *
 * Cada bloque solo aparece si el servicio de autenticación lo permite: con Supabase está todo; con las
 * cuentas demo o la API en Python, solo los datos (sin editar) y cerrar sesión.
 */

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, LoaderCircle, LogOut, Trash2 } from 'lucide-react';
import { MIN_PASSWORD_LENGTH, authService } from '../../auth/authService';
import type { AccountInfo } from '../../auth/authService';
import type { UserSession } from '../../types';
import { PageHeader } from '../common/AppShell';
import ConfirmDialog from '../company/ConfirmDialog';

interface AccountSettingsProps {
  user: UserSession;
  onLogout: () => void;
  /** Nombre cambiado: el panel enseña el nuevo. */
  onUserChange: (user: UserSession) => void;
  /** Cuenta eliminada: vuelve a la pantalla de inicio. */
  onAccountDeleted: () => void;
}

type Feedback = { tone: 'ok' | 'danger'; text: string } | null;

function FeedbackAlert({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <div role={feedback.tone === 'ok' ? 'status' : 'alert'} className={`alert alert-${feedback.tone} mt-3`}>
      <p>{feedback.text}</p>
    </div>
  );
}

export default function AccountSettings({ user, onLogout, onUserChange, onAccountDeleted }: AccountSettingsProps) {
  const isCompany = user.role === 'company';
  const [account, setAccount] = useState<AccountInfo | null>(null);

  // Datos
  const [name, setName] = useState<string>(user.name);
  const [savingName, setSavingName] = useState<boolean>(false);
  const [nameFeedback, setNameFeedback] = useState<Feedback>(null);

  // Contraseña
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [savingPassword, setSavingPassword] = useState<boolean>(false);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);

  // Eliminar cuenta
  const [confirmingDelete, setConfirmingDelete] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    authService.getAccount?.().then(info => {
      if (!cancelled) setAccount(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveName = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setNameFeedback(null);
    if (!authService.updateName) return;
    if (!name.trim()) {
      setNameFeedback({ tone: 'danger', text: isCompany ? 'Escribe el nombre de la empresa.' : 'Escribe tu nombre.' });
      return;
    }
    setSavingName(true);
    const result = await authService.updateName(name);
    setSavingName(false);
    if (!result.user) {
      setNameFeedback({ tone: 'danger', text: result.error });
      return;
    }
    onUserChange(result.user);
    setNameFeedback({ tone: 'ok', text: 'Nombre guardado.' });
  };

  const handleSavePassword = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setPasswordFeedback(null);
    if (!authService.updatePassword) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordFeedback({ tone: 'danger', text: `La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` });
      return;
    }
    setSavingPassword(true);
    const result = await authService.updatePassword(password);
    setSavingPassword(false);
    if (!result.user) {
      setPasswordFeedback({ tone: 'danger', text: result.error });
      return;
    }
    setPassword('');
    setShowPassword(false);
    setAccount(prev => (prev ? { ...prev, hasPassword: true } : prev));
    setPasswordFeedback({
      tone: 'ok',
      text: account?.hasPassword
        ? 'Contraseña cambiada.'
        : `Contraseña creada. Ya puedes entrar también con ${user.email} y esta contraseña.`
    });
  };

  const handleDelete = async (): Promise<void> => {
    if (!authService.deleteAccount) return;
    setConfirmingDelete(false);
    setDeleting(true);
    setDeleteError('');
    const { error } = await authService.deleteAccount();
    setDeleting(false);
    if (error) {
      setDeleteError(error);
      return;
    }
    onAccountDeleted();
  };

  const canEdit = Boolean(authService.updateName);
  const canChangePassword = Boolean(authService.updatePassword && account);
  const accessText = !account
    ? null
    : account.google && account.hasPassword
      ? 'Entras con Google y también con tu correo y contraseña.'
      : account.google
        ? 'Entras con Google. Si quieres, crea también una contraseña para entrar con tu correo.'
        : 'Entras con tu correo y contraseña.';

  return (
    <>
      <PageHeader
        eyebrow="Ajustes"
        title="Mi cuenta"
        description="Tus datos, cómo entras en el Orientador y la opción de eliminar tu cuenta."
      />

      <div className="max-w-2xl space-y-4">
        {/* 1. Datos */}
        <section className="card p-5 md:p-6" aria-labelledby="account-data-title">
          <h3 id="account-data-title" className="font-display font-bold text-lg text-fg mb-4">
            {isCompany ? 'Datos de la empresa' : 'Tus datos'}
          </h3>
          <form onSubmit={handleSaveName} className="space-y-3" noValidate>
            <div>
              <label htmlFor="account-name" className="label-tech">
                {isCompany ? 'Nombre de la empresa' : 'Nombre y apellidos'}
              </label>
              <input
                id="account-name"
                type="text"
                autoComplete={isCompany ? 'organization' : 'name'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                readOnly={!canEdit}
                className="input-technical"
              />
            </div>
            <div>
              <p className="label-tech">Correo electrónico</p>
              <p className="text-body text-fg break-all">{user.email}</p>
            </div>
            <div>
              <p className="label-tech">Tipo de perfil</p>
              <p className="text-body text-fg">{isCompany ? 'Empresa u organización' : 'Joven'}</p>
            </div>
            {canEdit && (
              <button type="submit" disabled={savingName || name.trim() === user.name} className="btn btn-primary">
                {savingName && <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />}
                <span>{savingName ? 'Guardando…' : 'Guardar cambios'}</span>
              </button>
            )}
          </form>
          <FeedbackAlert feedback={nameFeedback} />
        </section>

        {/* 2. Acceso */}
        {canChangePassword && (
          <section className="card p-5 md:p-6" aria-labelledby="account-access-title">
            <h3 id="account-access-title" className="font-display font-bold text-lg text-fg mb-1">Acceso</h3>
            {accessText && <p className="text-body text-fg-2 mb-4">{accessText}</p>}
            <form onSubmit={handleSavePassword} className="space-y-3" noValidate>
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="account-password" className="label-tech">
                    {account?.hasPassword ? 'Contraseña nueva' : 'Crear una contraseña'}
                  </label>
                  <span id="account-password-hint" className="text-meta text-fg-2">
                    Mínimo {MIN_PASSWORD_LENGTH} caracteres
                  </span>
                </div>
                <div className="relative">
                  <input
                    id="account-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    aria-describedby="account-password-hint"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
              <button type="submit" disabled={savingPassword || !password} className="btn btn-primary">
                {savingPassword && <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />}
                <span>
                  {savingPassword ? 'Guardando…' : account?.hasPassword ? 'Cambiar contraseña' : 'Crear contraseña'}
                </span>
              </button>
            </form>
            <FeedbackAlert feedback={passwordFeedback} />
          </section>
        )}

        {/* 3. Sesión */}
        <section className="card p-5 md:p-6" aria-labelledby="account-session-title">
          <h3 id="account-session-title" className="font-display font-bold text-lg text-fg mb-1">Sesión</h3>
          <p className="text-body text-fg-2 mb-4">Cierra la sesión en este dispositivo.</p>
          <button type="button" onClick={onLogout} className="btn btn-secondary">
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </section>

        {/* 4. Eliminar la cuenta */}
        {authService.deleteAccount && (
          <section className="card p-5 md:p-6 border-danger/50" aria-labelledby="account-delete-title">
            <h3 id="account-delete-title" className="font-display font-bold text-lg text-fg mb-1">Eliminar mi cuenta</h3>
            <p className="text-body text-fg-2 mb-4">
              Se borran para siempre tu cuenta, tu perfil y lo que la web guarda de ti en este navegador.
              No se puede deshacer.
            </p>
            {deleteError && (
              <div role="alert" className="alert alert-danger mb-3">
                <p>{deleteError}</p>
              </div>
            )}
            <button type="button" onClick={() => setConfirmingDelete(true)} disabled={deleting} className="btn btn-danger">
              {deleting ? <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Trash2 className="w-4 h-4" aria-hidden="true" />}
              <span>{deleting ? 'Eliminando…' : 'Eliminar mi cuenta'}</span>
            </button>
          </section>
        )}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="¿Eliminar tu cuenta?"
          confirmLabel="Eliminar definitivamente"
          tone="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        >
          <p>
            Se borrarán tu cuenta ({user.email}) y tu perfil. No podrás recuperarlos. Si vuelves a
            entrar más adelante, empezarás desde cero.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
