import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { handleApiError } from "@/lib/apiError";
import { createLead, listLeads } from "@/server/leadService";
import { CRMStage, LeadSource } from "@/lib/db";

const createLeadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  source: z.nativeEnum(LeadSource).default(LeadSource.MANUAL),
  interestNote: z.string().optional(),
  campaignId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePermission("leads:read");
    if (!ctx.organizationId) return NextResponse.json({ error: { code: "no_org", message: "Sin organización" } }, { status: 403 });

    const stageParam = req.nextUrl.searchParams.get("stage");
    const stage = stageParam && stageParam in CRMStage ? (stageParam as CRMStage) : undefined;

    const leads = await listLeads(ctx.organizationId, { stage });
    return NextResponse.json({ leads });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("leads:write");
    if (!ctx.organizationId) return NextResponse.json({ error: { code: "no_org", message: "Sin organización" } }, { status: 403 });

    const body = createLeadSchema.parse(await req.json());
    const lead = await createLead({ organizationId: ctx.organizationId, ...body });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
