import { db, CRMStage, type Prisma } from "@/lib/db";

/**
 * Pure domain logic for leads — no Next.js Request/Response here, so it's
 * usable from Route Handlers, Server Components, and (later) a queue
 * worker without change. See docs/ARCHITECTURE.md section 2.
 */

export interface CreateLeadInput {
  organizationId: string;
  name: string;
  phone: string;
  email?: string;
  source: Prisma.LeadCreateInput["source"];
  interestNote?: string;
  campaignId?: string;
  landingPageId?: string;
}

export async function createLead(input: CreateLeadInput) {
  const lead = await db.lead.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      source: input.source,
      interestNote: input.interestNote,
      campaignId: input.campaignId,
      landingPageId: input.landingPageId,
    },
  });

  await db.leadActivity.create({
    data: {
      leadId: lead.id,
      type: "LEAD_CREATED",
      actorType: "automation",
      actorLabel: "api:leads.create",
    },
  });

  return lead;
}

export async function listLeads(organizationId: string, filters?: { stage?: CRMStage }) {
  return db.lead.findMany({
    where: { organizationId, ...(filters?.stage ? { stage: filters.stage } : {}) },
    orderBy: { createdAt: "desc" },
    include: { assignedTo: { select: { id: true, name: true } }, campaign: true },
  });
}

export async function getLead(organizationId: string, leadId: string) {
  return db.lead.findFirst({
    where: { id: leadId, organizationId },
    include: {
      assignedTo: { select: { id: true, name: true } },
      notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" } },
      files: true,
      calls: { orderBy: { createdAt: "desc" } },
      appointments: { orderBy: { scheduledAt: "desc" } },
    },
  });
}

export async function changeLeadStage(organizationId: string, leadId: string, toStage: CRMStage) {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new Error("Lead not found");

  const fromStage = lead.stage;

  const updated = await db.lead.update({
    where: { id: leadId },
    data: { stage: toStage, stageChangedAt: new Date() },
  });

  await db.leadActivity.create({
    data: {
      leadId,
      type: "STAGE_CHANGED",
      fromStage,
      toStage,
      actorType: "user",
    },
  });

  return updated;
}

export async function addLeadNote(organizationId: string, leadId: string, authorId: string, body: string) {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new Error("Lead not found");

  const note = await db.leadNote.create({ data: { leadId, authorId, body } });

  await db.leadActivity.create({
    data: { leadId, type: "NOTE_ADDED", actorType: "user" },
  });

  return note;
}

export async function convertLeadToPatient(organizationId: string, leadId: string) {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new Error("Lead not found");

  const patient = await db.$transaction(async (tx) => {
    const created = await tx.patient.create({
      data: {
        organizationId,
        leadId: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        lifetimeValue: lead.estimatedValue ?? 0,
      },
    });

    await tx.lead.update({ where: { id: leadId }, data: { stage: CRMStage.PATIENT, stageChangedAt: new Date() } });
    await tx.leadActivity.create({
      data: { leadId, type: "CONVERTED_TO_PATIENT", actorType: "user", toStage: CRMStage.PATIENT },
    });

    return created;
  });

  return patient;
}
