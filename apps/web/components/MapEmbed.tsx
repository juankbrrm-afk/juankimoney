/**
 * Google Maps Embed API — a diferencia de Yappy/PagueloFacil, esta es pública y está
 * documentada sin muro de autenticación (developers.google.com/maps/documentation/embed),
 * así que se implementa directo, no como TODO. Solo necesita GOOGLE_MAPS_API_KEY
 * (restringida por HTTP referrer en la consola de Google Cloud — así es como Google
 * documenta usarla client-side, la key no es secreta en este modo de uso).
 *
 * Server Component: la URL del iframe se arma en el servidor, no se manda ningún JS de
 * Maps al cliente — el iframe mismo hace la petición a Google.
 */
export function MapEmbed({ query }: { query: string }) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-100 text-center text-sm text-stone-400">
        Mapa no disponible — falta GOOGLE_MAPS_API_KEY (ver apps/web/.env.example)
      </div>
    );
  }

  const src = `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}`;

  return (
    <iframe
      className="aspect-video w-full rounded-2xl border border-stone-200"
      src={src}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
      title={`Mapa de ${query}`}
    />
  );
}
