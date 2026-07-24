import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { buildItinerary, searchPlaces, type ItineraryStop } from "@/lib/ai/tools";
import type { Place } from "@/lib/data/places";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Protocolo de streaming propio (newline-delimited JSON) — ver app/api/chat/route.ts para
 * cómo se serializa sobre HTTP y components/ChatCanvas.tsx para cómo se consume. Se eligió
 * un protocolo propio en vez de adoptar el formato de data-stream del Vercel AI SDK para no
 * apostar por una superficie de API de una librería externa de rápida evolución sin poder
 * verificarla contra documentación en vivo; esto es más código pero cada línea está probada
 * de punta a punta en este repo (incluido el modo demo, que ejercita el mismo protocolo).
 */
export type StreamEvent =
  | { type: "mode"; mode: "live" | "demo" }
  | { type: "text-delta"; text: string }
  | { type: "places"; places: Place[] }
  | { type: "itinerary"; stops: ItineraryStop[] }
  | { type: "error"; message: string }
  | { type: "done" };

const TOOLS: Tool[] = [
  {
    name: "search_places",
    description:
      "Busca lugares reales y verificados (restaurantes, hoteles, tours, playas, vida nocturna, museos, actividades familiares) que coincidan con la intención del usuario. Úsala siempre antes de mencionar un lugar por nombre.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Intención de búsqueda en lenguaje natural" },
        categories: {
          type: "array",
          items: {
            type: "string",
            enum: ["restaurant", "rooftop", "beach", "hotel", "tour", "nightlife", "museum", "family"],
          },
        },
        maxPriceLevel: { type: "integer", minimum: 1, maximum: 4 },
        kidsFriendly: { type: "boolean" },
      },
      required: ["query"],
    },
  },
  {
    name: "build_itinerary",
    description:
      "Ordena una lista de IDs de lugares (obtenidos de search_places) en un itinerario factible, respetando horas disponibles y presupuesto como restricciones duras.",
    input_schema: {
      type: "object",
      properties: {
        placeIds: { type: "array", items: { type: "string" } },
        hoursAvailable: { type: "number" },
        budgetUsd: { type: "number" },
      },
      required: ["placeIds"],
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>) {
  if (name === "search_places") {
    const places = await searchPlaces(String(input.query ?? ""), {
      categories: input.categories as never,
      maxPriceLevel: input.maxPriceLevel as never,
      kidsFriendly: input.kidsFriendly as never,
    });
    return { places, result: places.map((p) => ({ id: p.id, name: p.name, category: p.category })) };
  }
  if (name === "build_itinerary") {
    const { stops, totalEstimatedUsd, withinBudget } = await buildItinerary(
      (input.placeIds as string[]) ?? [],
      { hoursAvailable: input.hoursAvailable as number, budgetUsd: input.budgetUsd as number },
    );
    return { stops, result: { totalEstimatedUsd, withinBudget, stopCount: stops.length } };
  }
  return { result: { error: "unknown tool" } };
}

function dedupePlaces(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Modo demo: sin ANTHROPIC_API_KEY configurada, no hay llamada a Claude — se corre
 * únicamente la búsqueda estructurada, transmitida palabra por palabra para ejercer
 * exactamente el mismo protocolo de streaming que el modo real (docs/panama-ai/09-mvp.md).
 */
async function* runDemoModeStream(userMessage: string): AsyncGenerator<StreamEvent> {
  yield { type: "mode", mode: "demo" };

  const places = await searchPlaces(userMessage);
  const budgetMatch = userMessage.match(/\$(\d+)/);
  const hoursMatch = userMessage.match(/(\d+)\s*hora/);

  const reply = places.length
    ? `Modo demo (sin ANTHROPIC_API_KEY): con lo que describiste, esto es lo más cercano en el dataset semilla. Te dejo ${places.length} opciones verificadas abajo.`
    : `Modo demo (sin ANTHROPIC_API_KEY): no encontré nada en el dataset semilla que encaje con "${userMessage}". Prueba con una categoría como comida, playa, tour o vida nocturna.`;

  for (const word of reply.split(" ")) {
    yield { type: "text-delta", text: word + " " };
    await sleep(15);
  }

  if (places.length) {
    yield { type: "places", places };
    const { stops } = await buildItinerary(places.map((p) => p.id), {
      budgetUsd: budgetMatch?.[1] ? Number(budgetMatch[1]) : undefined,
      hoursAvailable: hoursMatch?.[1] ? Number(hoursMatch[1]) : undefined,
    });
    if (stops.length) yield { type: "itinerary", stops };
  }

  yield { type: "done" };
}

const MODEL = "claude-sonnet-5";

async function* runLiveStream(history: ChatTurn[], userMessage: string): AsyncGenerator<StreamEvent> {
  yield { type: "mode", mode: "live" };

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content }) as MessageParam),
    { role: "user", content: userMessage },
  ];

  // Datos estructurados devueltos por las herramientas en este turno — la UI solo renderiza
  // PlaceCards a partir de esta lista, nunca parseando el texto libre del modelo. Es la
  // aplicación práctica del guardrail "cero alucinaciones" de docs/panama-ai/06-sistema-ia.md.
  const collectedPlaces: Place[] = [];
  let collectedItinerary: ItineraryStop[] | null = null;

  let loops = 0;
  while (loops < 5) {
    loops += 1;

    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    for await (const event of stream) {
      // Tipado laxo intencional: nos apoyamos en la forma documentada de los eventos SSE
      // de la Messages API (content_block_delta / delta.type === 'text_delta') en vez de
      // importar el tipo exacto exportado por esta versión del SDK, que puede cambiar.
      const e = event as { type: string; delta?: { type: string; text?: string } };
      if (e.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) {
        yield { type: "text-delta", text: e.delta.text };
      }
    }

    const finalMessage = await stream.finalMessage();

    if (finalMessage.stop_reason !== "tool_use") {
      if (collectedPlaces.length) yield { type: "places", places: dedupePlaces(collectedPlaces) };
      if (collectedItinerary) yield { type: "itinerary", stops: collectedItinerary };
      yield { type: "done" };
      return;
    }

    const toolUses = finalMessage.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    const toolResults = await Promise.all(
      toolUses.map(async (toolUse) => {
        const { result, places, stops } = (await runTool(toolUse.name, toolUse.input as Record<string, unknown>)) as {
          result: unknown;
          places?: Place[];
          stops?: ItineraryStop[];
        };
        if (places) collectedPlaces.push(...places);
        if (stops) collectedItinerary = stops;
        return {
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        };
      }),
    );

    messages.push({ role: "assistant", content: finalMessage.content });
    messages.push({ role: "user", content: toolResults });
  }

  yield { type: "error", message: "El concierge no pudo completar la respuesta (demasiadas herramientas encadenadas)." };
  yield { type: "done" };
}

export function runConciergeTurnStream(history: ChatTurn[], userMessage: string): AsyncGenerator<StreamEvent> {
  if (!process.env.ANTHROPIC_API_KEY) return runDemoModeStream(userMessage);
  return runLiveStream(history, userMessage);
}
