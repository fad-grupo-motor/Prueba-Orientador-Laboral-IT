# Plantillas de correo de Supabase Auth

Se pegan en Supabase → Authentication → Emails → Templates (dev y prod). Cada archivo es el
cuerpo ("Message body") de una plantilla; el asunto va aquí.

| Plantilla en Supabase | Archivo | Asunto |
| :-- | :-- | :-- |
| Confirm sign up | `confirmation.html` | Confirma tu cuenta del Orientador Laboral |
| Reset password | `recovery.html` | Restablece tu contraseña del Orientador Laboral |
| Change email address | `email_change.html` | Confirma tu nuevo correo en el Orientador Laboral |

Las demás plantillas (Magic link, Invite user, Reauthentication) no se usan en la web.

Remitente (Authentication → Emails → SMTP Settings): `no-reply@orientador.fad.es`,
"Orientador Laboral · Fad Juventud", enviado con Resend.
