import { runConciergeTurnStream, type ChatTurn } from "@/lib/ai/orchestrator";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const history = Array.isArray(body?.history) ? (body.history as ChatTurn[]) : [];

  if (!message) {
    return Response.json({ error: "El mensaje no puede estar vacío." }, { status: 400 });
  }
  if (message.length > 2000) {
    return Response.json({ error: "Mensaje demasiado largo." }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runConciergeTurnStream(history.slice(-20), message)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        console.error("concierge stream failed", err);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "error", message: "El concierge no pudo responder en este momento." }) + "\n",
          ),
        );
        controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
