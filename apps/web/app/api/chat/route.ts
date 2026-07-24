import { NextResponse } from "next/server";
import { runConciergeTurn, type ChatTurn } from "@/lib/ai/orchestrator";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const history = Array.isArray(body?.history) ? (body.history as ChatTurn[]) : [];

  if (!message) {
    return NextResponse.json({ error: "El mensaje no puede estar vacío." }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "Mensaje demasiado largo." }, { status: 400 });
  }

  try {
    const result = await runConciergeTurn(history.slice(-20), message);
    return NextResponse.json(result);
  } catch (err) {
    console.error("concierge turn failed", err);
    return NextResponse.json(
      { error: "El concierge no pudo responder en este momento. Intenta de nuevo." },
      { status: 502 },
    );
  }
}
