# Sistema de IA

## 1. Principio de diseño: proveedor intercambiable, prompts versionados

`packages/ai` expone una interfaz única:

```ts
interface AIProvider {
  complete(input: {
    system: string;
    messages: { role: "user" | "assistant"; content: string }[];
    responseFormat?: "text" | "json";
  }): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }>;
}
```

`OpenAIProvider` y `AnthropicProvider` implementan esta interfaz.
`resolveProvider(organizationId, useCase)` lee `AIAssistantConfig` de la
organización (o cae a defaults globales por variable de entorno) y devuelve
la instancia correcta. Ningún módulo de negocio importa `openai` o
`@anthropic-ai/sdk` directamente — todos pasan por `packages/ai`. Esto
permite: (a) cambiar de modelo por clínica sin deploy, (b) hacer A/B testing
de modelos, (c) tener un fallback automático si un proveedor cae.

## 2. Casos de uso de IA (los del brief, mapeados a implementación)

| Caso de uso | Dónde vive | Entrada | Salida |
|---|---|---|---|
| Responder WhatsApp | `server/assistantService.ts` vía `/api/webhooks/whatsapp` | historial de conversación + ficha del lead + `AIAssistantConfig` | respuesta + acción sugerida |
| Responder Instagram/Facebook | Mismo servicio, `channel=INSTAGRAM\|FACEBOOK` | Igual (vía Meta Graph API webhooks, fase 2) | Igual |
| Responder Email | Mismo servicio, `channel=EMAIL` (Resend inbound) | Igual | Igual |
| Calificar pacientes | `server/leadService.ts` → `qualifyLead()` | datos del lead + primeras interacciones | score 0-100 + razonamiento + próxima acción sugerida |
| Agendar consultas | Acción que el asistente puede tomar (`bookAppointment`) dentro de `assistantService` | slots disponibles (calendario) + preferencia del lead | `Appointment` creado + confirmación |
| Reprogramar citas | Misma acción, `rescheduleAppointment` | cita existente + nueva preferencia | `Appointment` actualizado |
| Responder FAQ | Prompt con "knowledge base" por clínica (precios rango, políticas, ubicación, horarios) cargado desde `Organization.faqConfig` | pregunta del lead | respuesta contextualizada, nunca inventada fuera de la KB |
| Recordar citas | n8n cron (24h y 2h antes) → llama `/api/ai/assistant/reply` con template de recordatorio, o mensaje de plantilla directo si no requiere generación | cita próxima | mensaje de WhatsApp enviado |
| Seguimiento automático | n8n (lead sin actividad N días) dispara `assistantService.followUp()` | lead inactivo | mensaje de reactivación generado |
| Clasificar prospectos | Mismo `qualifyLead`, además clasifica `intent` (informativo, listo para comprar, solo cotizando, no calificado) | historial completo | `LeadClassification` |

## 3. Barandas de seguridad (guardrails) — no negociables

Estas reglas están codificadas en el system prompt **y** validadas después de
la generación (no solo confiadas al prompt):

1. **Nunca dar diagnósticos médicos ni recomendar procedimientos específicos
   para el caso del paciente.** El asistente califica y agenda; el criterio
   clínico es del doctor. Cualquier pregunta clínica específica se responde
   con "eso lo evalúa el doctor en tu consulta" + oferta de agendar.
2. **Nunca prometer resultados** ("te va a quedar perfecto", "sin riesgos") —
   regulación de publicidad médica en Panamá lo prohíbe (ver `RISKS.md` #2).
3. **Precios: solo rangos pre-aprobados por la clínica**, nunca inventados.
   Si no hay rango configurado, responde "te confirmamos el costo exacto en
   la consulta" y ofrece agendar.
4. **Escalar a humano** si detecta: urgencia médica, insatisfacción/queja,
   o una pregunta fuera de la knowledge base configurada.
5. **Todas las respuestas se guardan** (`Message` con `sender=AI_ASSISTANT`)
   para auditoría y para que un humano pueda revisar/corregir.
6. Un post-procesador (`assertNoForbiddenClaims(text)`) escanea la respuesta
   generada contra una lista de patrones prohibidos (superlativos médicos,
   promesas de resultado, precios no configurados) antes de enviarla; si
   encuentra un match, no se envía automáticamente — se encola para revisión
   humana. Esto es defensa en profundidad: no confiar solo en el prompt.

## 4. Prompts como código, versionados

`packages/ai/src/prompts/` contiene un archivo por caso de uso
(`qualifyLead.ts`, `whatsappAssistant.ts`, `reportInsights.ts`,
`auditSummary.ts`). Cada prompt recibe el contexto tipado (TypeScript) y
compone el `system` prompt con: rol, especialidad de la clínica, tono de
marca configurado, knowledge base, y las barandas de la sección 3. Cambiar
un prompt es un PR revisable, no una edición silenciosa en una UI.

## 5. Costos y observabilidad

Cada llamada a `AIProvider.complete()` registra `AIUsageLog`
(organizationId, useCase, provider, model, inputTokens, outputTokens,
costEstimate, latencyMs). Esto alimenta: (a) el costo de IA por clínica para
pricing interno del plan, y (b) alertas si una clínica satura su cuota
mensual de IA — corta a respuestas de plantilla (sin IA) en vez de generar
costo ilimitado.
