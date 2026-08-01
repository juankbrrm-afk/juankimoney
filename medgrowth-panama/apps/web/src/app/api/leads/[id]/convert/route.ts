import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { handleApiError } from "@/lib/apiError";
import { convertLeadToPatient } from "@/server/leadService";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("leads:write");
    if (!ctx.organizationId) return NextResponse.json({ error: { code: "no_org", message: "Sin organización" } }, { status: 403 });

    const patient = await convertLeadToPatient(ctx.organizationId, params.id);
    return NextResponse.json({ patient }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
