"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Place } from "@/lib/data/places";

/**
 * Mapa con un marcador por lugar, sincronizado con lo que devuelve /explorar (filtros de
 * categoría/zona) — a diferencia de MapEmbed.tsx (un solo lugar, modo `place` del Embed API,
 * server component) esto necesita la Maps JavaScript API client-side para poner varios
 * marcadores y ajustar el zoom a todos ellos, así que usa NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
 * (misma key restringida por HTTP referrer que documenta MapEmbed — Google la documenta como
 * segura de exponer en el cliente en ese modo de uso, developers.google.com/maps/documentation
 * /javascript/get-api-key).
 *
 * Las coordenadas de cada lugar (`place.coordinates` en /data/places.json) son aproximadas —
 * conocimiento general de dónde queda cada sitio, no geocodificadas contra la Places API (este
 * sandbox de desarrollo no tiene salida a las APIs de Google para verificarlas). Antes de
 * producción real, confirmarlas con la Geocoding API o ajustándolas a mano en el mapa.
 */

declare global {
  interface Window {
    google?: typeof google;
    __panamaAiMapsCallback?: () => void;
  }
}

let loadPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    window.__panamaAiMapsCallback = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&callback=__panamaAiMapsCallback`;
    script.async = true;
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function MapView({
  places,
  apiKey,
}: {
  places: Pick<Place, "id" | "slug" | "name" | "zone" | "coordinates">[];
  apiKey?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const located = places.filter((p) => p.coordinates);

  useEffect(() => {
    if (!apiKey || !containerRef.current || located.length === 0) return;
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        const first = located[0];
        if (cancelled || !containerRef.current || !window.google || !first) return;

        const map = new window.google.maps.Map(containerRef.current, {
          center: first.coordinates!,
          zoom: 13,
          mapId: "PANAMA_AI_EXPLORAR",
        });

        const bounds = new window.google.maps.LatLngBounds();
        const infoWindow = new window.google.maps.InfoWindow();

        for (const place of located) {
          const marker = new window.google.maps.Marker({
            position: place.coordinates,
            map,
            title: place.name,
          });
          bounds.extend(place.coordinates!);
          marker.addListener("click", () => {
            infoWindow.setContent(
              `<a href="/lugares/${place.slug}" style="font-weight:600;color:#0d2a26">${place.name}</a><br/><span style="color:#78716c;font-size:12px">${place.zone}</span>`,
            );
            infoWindow.open(map, marker);
          });
        }

        if (located.length > 1) map.fitBounds(bounds);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, located.map((p) => p.id).join(",")]);

  if (!apiKey || failed || located.length === 0) {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-100 text-center text-sm text-stone-400 sm:aspect-[21/9]">
        {!apiKey
          ? "Mapa no disponible — falta GOOGLE_MAPS_API_KEY / NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"
          : failed
            ? "El mapa no cargó — mira la tarjeta de cada lugar mientras tanto."
            : "Ningún lugar con estos filtros tiene coordenadas todavía."}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200">
      <div ref={containerRef} className="aspect-[16/9] w-full sm:aspect-[21/9]" />
      <p className="border-t border-stone-100 px-3 py-1.5 text-right text-[10px] text-stone-400">
        Ver también:{" "}
        <Link href="/" className="hover:text-accent">
          preguntarle al concierge
        </Link>
      </p>
    </div>
  );
}
