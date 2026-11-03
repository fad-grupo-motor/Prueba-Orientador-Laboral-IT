/**
 * @file ResetPasswordScreen.tsx
 * @description Pantalla para elegir una contraseña nueva. Aparece al abrir el enlace del correo
 * "Restablece tu contraseña": la persona ya ha entrado con ese enlace y solo falta la contraseña.
 */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { MIN_PASSWORD_LENGTH, authService } from '../../auth/authService';
import type { UserSession } from '../../types';
import fadLogoUrl from '../../assets/brand/fad-juventud-light.png';

interface ResetPasswordScreenProps {
  /** Contraseña guardada: entra en su panel. */
  onDone: (user: UserSession) => void;
  /** No quiere cambiarla ahora: se cierra la sesión y vuelve al inicio. */
  onCancel: () => void;
}

export default function ResetPasswordScreen({ onDone, onCancel }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (!authService.updatePassword) return;

    setIsSaving(true);
    const { user, error: saveError } = await authService.updatePassword(password);
    setIsSaving(false);

    if (!user) {
      setError(saveError);
      return;
    }
    onDone(user);
  };

  return (
    <div className="min-h-dvh bg-canvas text-fg grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <img
          src={fadLogoUrl}
          alt="Fundación Fad Juventud"
          width={84}
          height={60}
          className="w-[84px] h-auto mb-6"
        />

        <section className="card-technical bg-surface p-5 md:p-8" aria-labelledby="reset-title">
          <span className="badge-technical">Orientador Laboral</span>
          <h1 id="reset-title" className="font-display font-bold text-xl tracking-[-0.015em] text-fg mt-3">
            Elige una contraseña nueva
          </h1>
          <p className="text-body text-fg-2 mt-1 mb-4">
            Escríbela y guárdala para volver a entrar en tu panel.
          </p>

          {error && (
            <div role="alert" className="alert alert-danger mb-3">
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="new-password" className="label-tech">Contraseña nueva</label>
                <span id="new-password-hint" className="text-meta text-fg-2">
                  Mínimo {MIN_PASSWORD_LENGTH} caracteres
                </span>
              </div>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  aria-describedby="new-password-hint"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
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

            <button type="submit" disabled={isSaving} className="btn btn-primary w-full">
              {isSaving && <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />}
              <span>{isSaving ? 'Guardando…' : 'Guardar contraseña'}</span>
            </button>

            <p className="text-body text-fg-2 text-center">
              <button
                type="button"
                onClick={onCancel}
                className="min-h-11 font-semibold text-accent-strong underline underline-offset-2"
              >
                Ahora no, volver al inicio
              </button>
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
