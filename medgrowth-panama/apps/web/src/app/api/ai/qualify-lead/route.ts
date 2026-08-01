import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveProvider, buildQualifyLeadPrompt, assertNoForbiddenClaims } from "@medgrowth/ai";
import { requirePermission } from "@/lib/rbac";
import { handleApiError } from "@/lib/apiError";
import { db } from "@/lib/db";

const bodySchema = z.object({ leadId: z.string() });

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("leads:write");
    if (!ctx.organizationId) return NextResponse.json({ error: { code: "no_org", message: "Sin organización" } }, { status: 403 });

    const { leadId } = bodySchema.parse(await req.json());

    const [lead, org, aiConfig] = await Promise.all([
      db.lead.findFirst({ where: { id: leadId, organizationId: ctx.organizationId } }),
      db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } }),
      db.aIAssistantConfig.findUnique({ where: { organizationId: ctx.organizationId } }),
    ]);

    if (!lead) return NextResponse.json({ error: { code: "not_found", message: "Lead no encontrado" } }, { status: 404 });

    const provider = resolveProvider({
      provider: aiConfig?.provider ?? "ANTHROPIC",
      apiKeys: { openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY },
    });

    const { system, messages } = buildQualifyLeadPrompt({
      clinicName: org.name,
      specialty: org.specialty,
      leadName: lead.name,
      source: lead.source,
      interestNote: lead.interestNote,
    });

    const start = Date.now();
    const result = await provider.complete({ model: aiConfig?.model ?? "claude-sonnet-5", system, messages, responseFormat: "json" });
    const latencyMs = Date.now() - start;

    const guardrail = assertNoForbiddenClaims(result.content);
    const parsed = JSON.parse(result.content) as { score: number; intent: string; reasoning: string };

    await db.lead.update({
      where: { id: lead.id },
      data: { score: parsed.score, scoreReasoning: parsed.reasoning },
    });

    await db.aIUsageLog.create({
      data: {
        organizationId: ctx.organizationId,
        useCase: "QUALIFY_LEAD",
        provider: provider.name,
        model: aiConfig?.model ?? "claude-sonnet-5",
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costEstimate: 0,
        latencyMs,
      },
    });

    return NextResponse.json({ ...parsed, guardrail });
  } catch (err) {
    return handleApiError(err);
  }
}
