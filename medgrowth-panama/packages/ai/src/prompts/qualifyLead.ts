import { AI_SAFETY_RULES } from "../guardrails";

export interface QualifyLeadContext {
  clinicName: string;
  specialty: string;
  leadName: string;
  source: string;
  interestNote?: string | null;
  conversationExcerpt?: string;
}

export function buildQualifyLeadPrompt(ctx: QualifyLeadContext) {
  const system = `Eres el asistente de calificación de leads de ${ctx.clinicName}, una clínica de ${ctx.specialty} en Panamá.

Tu tarea: dado el contexto de un interesado (lead), calificarlo del 0 al 100 según qué tan listo está para agendar una consulta pagada, y clasificar su intención.

${AI_SAFETY_RULES}

Responde ÚNICAMENTE con JSON válido en este formato exacto:
{"score": number, "intent": "informativo"|"listo_para_agendar"|"solo_cotizando"|"no_calificado", "reasoning": "string breve en español"}`;

  const messages = [
    {
      role: "user" as const,
      content: `Lead: ${ctx.leadName}
Fuente: ${ctx.source}
Interés declarado: ${ctx.interestNote ?? "no especificado"}
${ctx.conversationExcerpt ? `Conversación reciente:\n${ctx.conversationExcerpt}` : "Sin conversación previa aún."}`,
    },
  ];

  return { system, messages };
}
