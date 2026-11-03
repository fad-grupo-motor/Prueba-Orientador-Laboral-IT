#!/bin/bash
# Builds the three Supabase email templates from one shared layout.
# Run from the repository root: bash supabase/templates/build.sh
out=supabase/templates
render() { # file title preheader intro button outro link
cat > "$out/$1.html" <<EOF
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>$2</title>
</head>
<body style="margin:0;padding:0;background-color:#eef0f4;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">$3</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef0f4;">
<tr>
<td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr>
<td style="background-color:#0c0e13;border-radius:10px 10px 0 0;padding:28px 40px;">
<img src="https://orientador.fad.es/email/fad-juventud-light.png" width="98" height="70" alt="Fad Juventud" style="display:block;border:0;outline:none;text-decoration:none;width:98px;height:70px;">
</td>
</tr>
<tr>
<td style="background-color:#ffffff;padding:40px 40px 32px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<p style="margin:0 0 8px;font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#4a6fe0;">Orientador Laboral</p>
<h1 style="margin:0 0 20px;font-size:24px;line-height:32px;font-weight:700;color:#0c0e13;">$2</h1>
<p style="margin:0 0 28px;font-size:16px;line-height:26px;color:#3b4150;">$4</p>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
<tr>
<td align="center" bgcolor="#6b93ff" style="border-radius:6px;">
<a href="$7" target="_blank" style="display:inline-block;padding:14px 28px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:20px;font-weight:700;color:#0c0e13;text-decoration:none;border-radius:6px;">$5</a>
</td>
</tr>
</table>
<p style="margin:28px 0 0;font-size:14px;line-height:22px;color:#5b6170;">$6</p>
<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e3e6ec;font-size:13px;line-height:20px;color:#5b6170;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="$7" style="color:#4a6fe0;text-decoration:underline;word-break:break-all;">$7</a></p>
</td>
</tr>
<tr>
<td style="background-color:#f7f8fa;border-top:1px solid #e3e6ec;border-radius:0 0 10px 10px;padding:24px 40px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#7a8090;">
<strong style="color:#3b4150;">Fundación Fad Juventud</strong> · Orientador Laboral<br>
Este es un correo automático, por favor no respondas a este mensaje.
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
EOF
}
render confirmation "Confirma tu cuenta" \
  "Confirma tu correo para empezar a usar el Orientador Laboral." \
  "Gracias por registrarte en el Orientador Laboral de Fad Juventud. Confirma tu dirección de correo para activar tu cuenta y empezar a usarla." \
  "Confirmar mi cuenta" \
  "Si no has creado una cuenta en el Orientador Laboral, puedes ignorar este correo." \
  "{{ .SiteURL }}/?token_hash={{ .TokenHash }}&amp;type=email"
render recovery "Restablece tu contraseña" \
  "Elige una contraseña nueva para tu cuenta del Orientador Laboral." \
  "Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Pulsa el botón para elegir una nueva." \
  "Elegir nueva contraseña" \
  "Por seguridad, el enlace caduca en una hora. Si no has solicitado este cambio, ignora este correo: tu contraseña no se modificará." \
  "{{ .SiteURL }}/?token_hash={{ .TokenHash }}&amp;type=recovery"
render email_change "Confirma tu nuevo correo" \
  "Confirma el cambio de correo de tu cuenta del Orientador Laboral." \
  "Has solicitado cambiar el correo de tu cuenta de <strong>{{ .Email }}</strong> a <strong>{{ .NewEmail }}</strong>. Pulsa el botón para confirmar el cambio." \
  "Confirmar el cambio" \
  "Si no has solicitado este cambio, ignora este correo: tu cuenta seguirá con la dirección actual." \
  "{{ .SiteURL }}/?token_hash={{ .TokenHash }}&amp;type=email_change"
