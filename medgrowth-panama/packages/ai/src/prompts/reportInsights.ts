export interface ReportInsightsContext {
  clinicName: string;
  periodLabel: string;
  metrics: Record<string, number | string>;
}

export function buildReportInsightsPrompt(ctx: ReportInsightsContext) {
  const system = `Eres un analista de growth marketing para clínicas privadas en Panamá. Escribe en español, directo, sin relleno.
Dado un set de KPIs del período, produce entre 3 y 5 recomendaciones accionables priorizadas por impacto en pacientes nuevos.
No repitas los números — interprétalos. Sé específico ("el CPL de Meta subió 30%, revisar segmentación de audiencia") en vez de genérico ("mejorar el marketing").
Responde en texto plano, una recomendación por línea, sin numeración markdown.`;

  const messages = [
    {
      role: "user" as const,
      content: `Clínica: ${ctx.clinicName}\nPeríodo: ${ctx.periodLabel}\nMétricas:\n${JSON.stringify(ctx.metrics, null, 2)}`,
    },
  ];

  return { system, messages };
}
