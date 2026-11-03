# Prueba Orientador Laboral

Orientación laboral para jóvenes que buscan su primer empleo o quieren cambiar de sector: diagnóstico, plan de acción,
ofertas de empleo con salario visible, práctica de entrevistas y formación gratuita o subvencionada.

## Puesta en marcha

```bash
npm install
cp .env.example .env.development.local   # en Windows: copy .env.example .env.development.local
npm run dev
```

Cada comando lee su propio archivo de variables (ninguno se sube a GitHub):

- `npm run dev` → `.env.development.local`: Supabase **dev** (`orientador-dev`).
- `npm run build` → `.env.production.local`: Supabase **prod** (`orientador-prod`).

Sin rellenar nada, la web funciona con las cuentas demo y el catálogo local. Para el login real pon
`VITE_AUTH_PROVIDER=supabase` y la URL y la clave **publishable** del proyecto (nunca la *secret*).

## Formación: catálogo local o Supabase

De momento los cursos se leen de la copia local `src/data/trainingCatalogData.ts` (generada desde
`supabase/training_resources.sql`, con los enlaces de la hoja de recursos). Para volver a leerlos de Supabase,
pon `VITE_TRAINING_SOURCE=supabase` en `.env.development.local` y sigue estos pasos:

1. En Supabase Studio abre **SQL Editor → New query**, pega el contenido de
   [`supabase/training_resources.sql`](supabase/training_resources.sql) y pulsa **Run**.
   Debe terminar mostrando `total 30 · relacionados_it 21`. Se puede volver a ejecutar sin problema.
2. En **Project Settings → API** copia la *Project URL* y la clave pública (*anon* o *publishable*)
   en `.env.development.local`.
3. `npm run dev` y entra como joven: en *Plan de acción* aparece el bloque **Cursos para lo que te falta**.

Con Supabase activado, si la conexión falla,
la web lo dice en pantalla con el motivo y un botón *Reintentar*, y la consola del navegador (F12)
muestra el detalle con el prefijo `[formación]`:

| Código en "Detalle técnico" | Qué significa | Qué revisar |
| --- | --- | --- |
| `not_configured` | La web se compiló sin las claves | Que estén las dos variables en `.env.development.local` (local) o en Vercel (publicada); reiniciar `npm run dev` o volver a desplegar en Vercel |
| `network` | La petición no llegó a Supabase | Internet, `VITE_SUPABASE_URL` bien escrita, proyecto no pausado |
| `request_failed` | Supabase respondió con error (se muestra el código HTTP) | 401: clave incorrecta · 404 / `42P01`: la tabla no existe · 403 / `42501`: permisos |
| `empty` | La consulta funcionó pero no hay cursos visibles | Que se ejecutara el SQL y que exista la política RLS de lectura |

### Cómo se recomienda

- `src/data/requirementSkills.ts` traduce cada requisito del puesto (p. ej. "HTML5 & CSS3") a habilidades
  del catálogo (p. ej. `HTML/CSS`).
- Cada curso tiene en la columna `skills` las habilidades que cubre, con **el mismo texto exacto**.
- `src/lib/courseRecommendations.ts` ordena los cursos por cuántos requisitos pendientes cubren y, a igualdad,
  prefiere los gratuitos o subvencionados, en español y con certificado.

### Añadir o editar cursos

Desde **Table Editor → training_resources**. Para que un curso se recomiende necesita `it_related = true`,
`active = true` y habilidades en `skills` del vocabulario de `requirementSkills.ts`.
La web solo puede **leer** la tabla (políticas RLS); los cambios se hacen siempre desde Studio.

## Publicar

La web está en **Vercel** (cuenta `vercel@fad.es`, proyecto `orientador`) y se sirve en
`https://orientador.fad.es`. **Cada merge en `main` se publica solo**: no hay que ejecutar nada.
Las variables de producción están en Vercel → Settings → Environment Variables (Production).

`npm run deploy` (GitHub Pages) ya no se usa: el dominio apunta a Vercel.

## Correos de la web

Los correos de confirmar cuenta y restablecer contraseña los envía Supabase a través de **Resend**,
desde `no-reply@orientador.fad.es`. Las plantillas están en [`supabase/templates`](supabase/templates)
(se pegan en Supabase → Authentication → Emails → Templates, en dev y en prod).

## API en Python (backend/)

API en FastAPI que sustituirá a `localStorage` para ofertas, decisiones, candidaturas y consentimiento.
Implementa exactamente las rutas de `httpOffersService` (`src/services/offersService.ts`), con JSON en camelCase.

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env              # cambia JWT_SECRET
.venv/bin/python -m app.cli seed  # cuentas demo (contraseña 123456) y ofertas de ejemplo
.venv/bin/uvicorn app.main:app --reload   # http://localhost:8000/docs
.venv/bin/python -m pytest
```

Para que el frontend la use, define `VITE_API_URL=http://localhost:8000` en `.env.development.local`.
Detalles (seguridad, conservación de 12 meses, avisos) en [`backend/README.md`](backend/README.md).
