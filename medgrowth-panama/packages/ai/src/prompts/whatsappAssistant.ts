import { AI_SAFETY_RULES } from "../guardrails";

export interface WhatsappAssistantContext {
  clinicName: string;
  specialty: string;
  brandTone?: string | null;
  faqConfig?: Record<string, unknown> | null;
  leadName: string;
  history: { role: "user" | "assistant"; content: string }[];
  incomingMessage: string;
}

export function buildWhatsappAssistantPrompt(ctx: WhatsappAssistantContext) {
  const system = `Eres el asistente de WhatsApp de ${ctx.clinicName}, una clínica de ${ctx.specialty} en Panamá.
Tono de marca: ${ctx.brandTone ?? "profesional, cálido y cercano"}.

Información de la clínica que puedes usar (no inventes nada fuera de esto):
${JSON.stringify(ctx.faqConfig ?? {}, null, 2)}

${AI_SAFETY_RULES}

Responde en español, de forma breve (2-4 líneas, es WhatsApp), y termina siempre invitando a agendar una consulta o a hablar con el equipo si la pregunta se sale de lo que sabes.

Responde ÚNICAMENTE con JSON válido:
{"reply": "string", "action": "reply_only"|"book_appointment"|"escalate_to_human"}`;

  const messages = [
    ...ctx.history,
    { role: "user" as const, content: ctx.incomingMessage },
  ];

  return { system, messages };
}
