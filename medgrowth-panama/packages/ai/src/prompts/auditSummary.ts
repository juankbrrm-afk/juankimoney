export interface AuditSummaryContext {
  clinicName: string;
  rawResults: Record<string, unknown>;
}

export function buildAuditSummaryPrompt(ctx: AuditSummaryContext) {
  const system = `Eres un consultor de presencia digital para clínicas privadas en Panamá. Escribe en español.
Dado el resultado crudo de una auditoría (velocidad de sitio, SEO, Google Business Profile, redes sociales), produce un resumen priorizado: las 3 cosas que más le están costando pacientes a esta clínica ahora mismo, en lenguaje simple para un dueño de clínica sin conocimiento técnico.
No uses jerga técnica sin explicarla en la misma frase.`;

  const messages = [
    {
      role: "user" as const,
      content: `Clínica: ${ctx.clinicName}\nResultados crudos:\n${JSON.stringify(ctx.rawResults, null, 2)}`,
    },
  ];

  return { system, messages };
}
