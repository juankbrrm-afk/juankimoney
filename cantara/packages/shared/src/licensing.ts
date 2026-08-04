/**
 * Qué puede hacer el usuario con lo que descarga, según el proveedor musical
 * que generó la pista.
 *
 * Esto se muestra en el momento de descargar, no enterrado en unos términos:
 * es cuando el usuario decide qué va a hacer con el archivo. El campo
 * `reviewedAt` existe porque estas condiciones cambian —y en 2026 están
 * cambiando— así que la nota lleva fecha de revisión visible.
 */

export type CommercialUse = 'allowed' | 'requires-license' | 'restricted' | 'unknown';

export interface LicenseNote {
  readonly provider: string;
  readonly summary: string;
  readonly streaming: CommercialUse;
  readonly monetizedVideo: CommercialUse;
  readonly advertising: CommercialUse;
  readonly reviewedAt: string;
  readonly termsUrl?: string;
}

export const LICENSE_NOTES: Readonly<Record<string, LicenseNote>> = {
  elevenlabs: {
    provider: 'ElevenLabs Music',
    summary:
      'Uso comercial amplio incluido con la generación por API. Publicidad, cine, TV, videojuegos y distribución empresarial requieren una licencia adicional.',
    streaming: 'allowed',
    monetizedVideo: 'allowed',
    advertising: 'requires-license',
    reviewedAt: '2026-08-01',
    termsUrl: 'https://elevenlabs.io/music-api',
  },
  suno: {
    provider: 'Suno',
    summary:
      'Los derechos comerciales dependen del plan y están sujetos a litigios en curso. Revisa sus términos antes de publicar.',
    streaming: 'unknown',
    monetizedVideo: 'unknown',
    advertising: 'restricted',
    reviewedAt: '2026-08-01',
  },
  local: {
    provider: 'Motor local',
    summary:
      'Audio sintetizado localmente para desarrollo y pruebas. No es material publicable.',
    streaming: 'restricted',
    monetizedVideo: 'restricted',
    advertising: 'restricted',
    reviewedAt: '2026-08-01',
  },
};

export const COMMERCIAL_USE_LABELS: Readonly<Record<CommercialUse, string>> = {
  allowed: 'Permitido',
  'requires-license': 'Requiere licencia adicional',
  restricted: 'No permitido',
  unknown: 'Por confirmar',
};

export function licenseFor(provider: string): LicenseNote {
  return LICENSE_NOTES[provider] ?? LICENSE_NOTES.local!;
}
