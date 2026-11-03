/**
 * @file clearUserBrowserData.ts
 * @description Borra de este navegador lo que la web guarda de una persona (al eliminar su cuenta).
 *
 * Las claves salen de: `young_profile_v1:` (lib/youngProfileStorage.ts),
 * `it_orientador_itinerary:` y `young_plan_visited:` (components/young/journey.ts) y
 * `offers_fad_support:` (components/offers/OffersSection.tsx). Si se añade otra clave por persona,
 * hay que añadirla aquí.
 */

const PER_USER_PREFIXES = [
  'young_profile_v1:',
  'it_orientador_itinerary:',
  'young_plan_visited:',
  'offers_fad_support:'
];

export function clearUserBrowserData(email: string): void {
  const owners = new Set([email, email.trim().toLowerCase()]);
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(
      (key): key is string => key !== null
    );
    for (const key of keys) {
      const prefix = PER_USER_PREFIXES.find(p => key.startsWith(p));
      if (prefix && owners.has(key.slice(prefix.length))) localStorage.removeItem(key);
    }
  } catch (error) {
    console.error('[cuenta] No se han podido borrar los datos guardados en el navegador:', error);
  }
}
