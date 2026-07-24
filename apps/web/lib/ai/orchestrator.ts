import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { buildItinerary, searchPlaces, type ItineraryStop } from "@/lib/ai/tools";
import type { Place } from "@/lib/data/places";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface OrchestratorResult {
  reply: string;
  places: Place[];
  itinerary: ItineraryStop[] | null;
  mode: "live" | "demo";
}

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

function runTool(name: string, input: Record<string, unknown>) {
  if (name === "search_places") {
    const places = searchPlaces(String(input.query ?? ""), {
      categories: input.categories as never,
      maxPriceLevel: input.maxPriceLevel as never,
      kidsFriendly: input.kidsFriendly as never,
    });
    return { places, result: places.map((p) => ({ id: p.id, name: p.name, category: p.category })) };
  }
  if (name === "build_itinerary") {
    const { stops, totalEstimatedUsd, withinBudget } = buildItinerary(
      (input.placeIds as string[]) ?? [],
      { hoursAvailable: input.hoursAvailable as number, budgetUsd: input.budgetUsd as number },
    );
    return { stops, result: { totalEstimatedUsd, withinBudget, stopCount: stops.length } };
  }
  return { result: { error: "unknown tool" } };
}

/**
 * Modo demo: sin ANTHROPIC_API_KEY configurada, no hay llamada a Claude — se corre
 * únicamente la búsqueda estructurada para poder probar el producto end-to-end sin
 * credenciales. Ver docs/panama-ai/09-mvp.md.
 */
function runDemoMode(userMessage: string): OrchestratorResult {
  const places = searchPlaces(userMessage);
  const budgetMatch = userMessage.match(/\$(\d+)/);
  const hoursMatch = userMessage.match(/(\d+)\s*hora/);
  const itinerary = places.length
    ? buildItinerary(places.map((p) => p.id), {
        budgetUsd: budgetMatch?.[1] ? Number(budgetMatch[1]) : undefined,
        hoursAvailable: hoursMatch?.[1] ? Number(hoursMatch[1]) : undefined,
      }).stops
    : null;

  const reply = places.length
    ? `Modo demo (sin ANTHROPIC_API_KEY): con lo que describiste, esto es lo más cercano en el dataset semilla. Te dejo ${places.length} opciones verificadas abajo.`
    : `Modo demo (sin ANTHROPIC_API_KEY): no encontré nada en el dataset semilla que encaje con "${userMessage}". Prueba con una categoría como comida, playa, tour o vida nocturna.`;

  return { reply, places, itinerary, mode: "demo" };
}

export async function runConciergeTurn(
  history: ChatTurn[],
  userMessage: string,
): Promise<OrchestratorResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return runDemoMode(userMessage);
  }

  const anthropic = new Anthropic({ apiKey });
  const messages: MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content }) as MessageParam),
    { role: "user", content: userMessage },
  ];

  // Datos estructurados devueltos por las herramientas en este turno — la UI solo
  // renderiza PlaceCards a partir de esta lista, nunca parseando el texto libre del
  // modelo. Es la aplicación práctica del guardrail "cero alucinaciones" descrito en
  // docs/panama-ai/06-sistema-ia.md: aunque el modelo mencionara un lugar inventado en
  // el texto, la interfaz jamás podría mostrarlo como tarjeta porque no vendría de aquí.
  const collectedPlaces: Place[] = [];
  let collectedItinerary: ItineraryStop[] | null = null;

  const MODEL = "claude-sonnet-5";

  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages,
  });

  let loops = 0;
  while (response.stop_reason === "tool_use" && loops < 4) {
    loops += 1;
    const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    const toolResults = toolUses.map((toolUse) => {
      const { result, places, stops } = runTool(toolUse.name, toolUse.input as Record<string, unknown>) as {
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
    });

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const reply = textBlock && textBlock.type === "text" ? textBlock.text : "";

  return {
    reply,
    places: dedupePlaces(collectedPlaces),
    itinerary: collectedItinerary,
    mode: "live",
  };
}

function dedupePlaces(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}
