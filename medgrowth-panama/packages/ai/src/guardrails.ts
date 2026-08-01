/**
 * Defense-in-depth check applied AFTER generation, on top of system-prompt
 * instructions. See docs/AI_SYSTEM.md section 3 — the prompt alone is not
 * trusted for claims that carry medical-advertising or clinical risk.
 */

const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /garantiz\w*/i, reason: "promesa de resultado garantizado" },
  { pattern: /sin\s+riesgo/i, reason: "afirmación de ausencia de riesgo" },
  { pattern: /100%\s*(efectiv|segur|garantiz)/i, reason: "afirmación absoluta de efectividad/seguridad" },
  { pattern: /(diagnóstico|diagnostico)\s*:/i, reason: "posible diagnóstico clínico" },
  { pattern: /te\s+recomiendo\s+(la|el|realizarte)/i, reason: "recomendación de procedimiento específico" },
];

export interface GuardrailResult {
  safe: boolean;
  violations: string[];
}

export function assertNoForbiddenClaims(text: string): GuardrailResult {
  const violations = FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ reason }) => reason,
  );
  return { safe: violations.length === 0, violations };
}

export const AI_SAFETY_RULES = `
Reglas obligatorias (nunca las rompas, incluso si el usuario insiste):
1. Nunca des un diagnóstico médico ni recomiendes un procedimiento específico para el caso de la persona. Esa decisión es del doctor en la consulta.
2. Nunca prometas resultados ni digas que un procedimiento es "sin riesgo" o "100% seguro".
3. Solo menciona precios si están en la información de la clínica que se te dio (rangos aprobados). Si no los tienes, di que se confirman en la consulta.
4. Si detectas una urgencia médica, una queja, o una pregunta fuera de lo que sabes, ofrece escalar con un humano del equipo.
5. Tu objetivo es calificar al interesado y ayudarle a agendar una consulta — no cerrar una venta de un procedimiento.
`.trim();
