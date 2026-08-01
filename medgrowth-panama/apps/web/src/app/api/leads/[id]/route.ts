import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { handleApiError } from "@/lib/apiError";
import { getLead, changeLeadStage } from "@/server/leadService";
import { db, CRMStage } from "@/lib/db";

const patchSchema = z.object({
  stage: z.nativeEnum(CRMStage).optional(),
  assignedToId: z.string().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("leads:read");
    if (!ctx.organizationId) return NextResponse.json({ error: { code: "no_org", message: "Sin organización" } }, { status: 403 });

    const lead = await getLead(ctx.organizationId, params.id);
    if (!lead) return NextResponse.json({ error: { code: "not_found", message: "Lead no encontrado" } }, { status: 404 });

    return NextResponse.json({ lead });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("leads:write");
    if (!ctx.organizationId) return NextResponse.json({ error: { code: "no_org", message: "Sin organización" } }, { status: 403 });

    const body = patchSchema.parse(await req.json());

    if (body.stage) {
      await changeLeadStage(ctx.organizationId, params.id, body.stage);
    }
    if (body.assignedToId) {
      await db.lead.update({ where: { id: params.id }, data: { assignedToId: body.assignedToId } });
    }

    const lead = await getLead(ctx.organizationId, params.id);
    return NextResponse.json({ lead });
  } catch (err) {
    return handleApiError(err);
  }
}
