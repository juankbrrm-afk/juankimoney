import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const bodySchema = z.object({
  leadId: z.string(),
  step: z.string(),
  status: z.enum(["completed", "failed"]),
  error: z.string().optional(),
});

/**
 * Callback used by n8n workflows (docs/AUTOMATIONS.md) to report back the
 * result of each automation step, written to LeadActivity so the lead
 * timeline shows exactly what ran and whether it failed.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-n8n-secret");
  if (!secret || secret !== process.env.N8N_WEBHOOK_SECRET) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Firma inválida" } }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "validation_error", message: parsed.error.message } }, { status: 400 });
  }

  const { leadId, step, status, error } = parsed.data;

  await db.leadActivity.create({
    data: {
      leadId,
      type: "AUTOMATION_RUN",
      actorType: "automation",
      actorLabel: `n8n: ${step}`,
      metadata: { status, error },
    },
  });

  return NextResponse.json({ ok: true });
}
