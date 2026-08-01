import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, LeadSource } from "@/lib/db";
import { createLead } from "@/server/leadService";

const publicLeadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  interestNote: z.string().optional(),
});

/**
 * Public, unauthenticated endpoint consumed by published landing pages.
 * Production hardening (rate limiting by IP, invisible captcha) is tracked
 * in docs/RISKS.md #11 — not yet wired in this MVP.
 */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const landingPage = await db.landingPage.findUnique({
    where: { slug: decodeURIComponent(params.slug) },
  });

  if (!landingPage || !landingPage.published) {
    return NextResponse.json({ error: { code: "not_found", message: "Landing no encontrada" } }, { status: 404 });
  }

  const parsed = publicLeadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "validation_error", message: parsed.error.message } }, { status: 400 });
  }

  const lead = await createLead({
    organizationId: landingPage.organizationId,
    source: LeadSource.LANDING_PAGE,
    landingPageId: landingPage.id,
    ...parsed.data,
  });

  await db.consentRecord.create({
    data: {
      organizationId: landingPage.organizationId,
      leadId: lead.id,
      channel: "landing_form",
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      textShown:
        "Al enviar este formulario aceptas que usemos tus datos para contactarte sobre tu consulta.",
    },
  });

  return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 });
}
