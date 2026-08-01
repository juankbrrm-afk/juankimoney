import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { handleApiError } from "@/lib/apiError";
import { addLeadNote } from "@/server/leadService";

const bodySchema = z.object({ body: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("leads:write");
    if (!ctx.organizationId) return NextResponse.json({ error: { code: "no_org", message: "Sin organización" } }, { status: 403 });

    const { body } = bodySchema.parse(await req.json());
    const note = await addLeadNote(ctx.organizationId, params.id, ctx.userId, body);

    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
