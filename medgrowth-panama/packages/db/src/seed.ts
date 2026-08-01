import { PrismaClient, Role, ClinicSpecialty, CRMStage, LeadSource, AdChannel } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEMO_PASSWORD = "MedGrowth2026!";

async function main() {
  console.log("Seeding MedGrowth Panama demo data...");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const org = await db.organization.upsert({
    where: { slug: "clinica-demo-panama" },
    update: {},
    create: {
      name: "Clínica Demo Panamá",
      slug: "clinica-demo-panama",
      specialty: ClinicSpecialty.AESTHETIC_MEDICINE,
      city: "Ciudad de Panamá",
      brandTone: "Cálido, profesional, cercano — nunca alarmista ni exagerado.",
      faqConfig: {
        horarios: "Lunes a viernes 8am-6pm, sábados 8am-1pm",
        ubicacion: "Costa del Este, Ciudad de Panamá",
        rangosPrecios: {
          "consulta inicial": "$50 - $75",
          "valoracion estetica": "$0 (cortesía)",
        },
        politicaCancelacion: "Reprogramable hasta 24h antes sin costo.",
      },
    },
  });

  const usersByRole: { role: Role; name: string; email: string }[] = [
    { role: Role.SUPER_ADMIN, name: "Juan (MedGrowth Staff)", email: "staff@medgrowthpanama.com" },
    { role: Role.ADMIN, name: "Dra. Ana Administradora", email: "admin@clinicademo.pa" },
    { role: Role.MANAGER, name: "Carlos Manager", email: "manager@clinicademo.pa" },
    { role: Role.RECEPTION, name: "Lucía Recepción", email: "recepcion@clinicademo.pa" },
    { role: Role.DOCTOR, name: "Dr. Roberto Doctor", email: "doctor@clinicademo.pa" },
    { role: Role.MARKETING, name: "Marta Marketing", email: "marketing@clinicademo.pa" },
    { role: Role.SALES, name: "Sofía Ventas", email: "ventas@clinicademo.pa" },
    { role: Role.CLIENT, name: "Cliente Portal", email: "cliente@clinicademo.pa" },
  ];

  const users: Record<string, { id: string }> = {};
  for (const u of usersByRole) {
    const created = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        organizationId: u.role === Role.SUPER_ADMIN ? null : org.id,
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
      },
    });
    users[u.role] = created;
  }

  await db.aIAssistantConfig.upsert({
    where: { organizationId: org.id },
    update: {},
    create: { organizationId: org.id },
  });

  const campaign = await db.campaign.create({
    data: {
      organizationId: org.id,
      name: "Meta Ads — Rejuvenecimiento facial Q1",
      channel: AdChannel.META_ADS,
      costTotal: 850,
      utmCampaign: "rejuvenecimiento-facial-q1",
    },
  });

  const template = await db.landingTemplate.create({
    data: {
      name: "Medicina Estética — Consulta gratuita",
      specialty: ClinicSpecialty.AESTHETIC_MEDICINE,
      schema: {
        sections: ["hero", "beneficios", "testimonios", "faq", "formulario"],
      },
    },
  });

  const landingPage = await db.landingPage.create({
    data: {
      organizationId: org.id,
      templateId: template.id,
      slug: "clinica-demo-panama/rejuvenecimiento-facial",
      title: "Recupera tu piel — Consulta gratuita en Ciudad de Panamá",
      content: {
        headline: "Recupera la firmeza de tu piel con tecnología de última generación",
        subheadline: "Agenda tu valoración gratuita esta semana",
        cta: "Quiero mi consulta gratis",
      },
      published: true,
    },
  });

  const leadSeeds = [
    { name: "María González", phone: "+507 6000-0001", stage: CRMStage.LEAD, source: LeadSource.META_ADS, score: 40 },
    { name: "José Pérez", phone: "+507 6000-0002", stage: CRMStage.CONTACTED, source: LeadSource.LANDING_PAGE, score: 55 },
    { name: "Ana Ruiz", phone: "+507 6000-0003", stage: CRMStage.QUALIFIED, source: LeadSource.GOOGLE_ADS, score: 78 },
    { name: "Luis Herrera", phone: "+507 6000-0004", stage: CRMStage.QUOTED, source: LeadSource.WHATSAPP_DIRECT, score: 82 },
    { name: "Carmen Díaz", phone: "+507 6000-0005", stage: CRMStage.APPOINTMENT_SCHEDULED, source: LeadSource.META_ADS, score: 90 },
    { name: "Roberto Sánchez", phone: "+507 6000-0006", stage: CRMStage.NOT_INTERESTED, source: LeadSource.ORGANIC, score: 20 },
  ];

  for (const l of leadSeeds) {
    const lead = await db.lead.create({
      data: {
        organizationId: org.id,
        name: l.name,
        phone: l.phone,
        stage: l.stage,
        source: l.source,
        score: l.score,
        campaignId: l.source === LeadSource.META_ADS ? campaign.id : null,
        landingPageId: l.source === LeadSource.LANDING_PAGE ? landingPage.id : null,
        assignedToId: users[Role.SALES].id,
      },
    });
    await db.leadActivity.create({
      data: {
        leadId: lead.id,
        type: "LEAD_CREATED",
        actorType: "automation",
        actorLabel: "n8n: lead.created",
      },
    });
  }

  const patientLead = await db.lead.create({
    data: {
      organizationId: org.id,
      name: "Patricia Núñez",
      phone: "+507 6000-0007",
      stage: CRMStage.PATIENT,
      source: LeadSource.GOOGLE_ADS,
      score: 95,
      estimatedValue: 1200,
      assignedToId: users[Role.SALES].id,
    },
  });

  const patient = await db.patient.create({
    data: {
      organizationId: org.id,
      leadId: patientLead.id,
      name: patientLead.name,
      phone: patientLead.phone,
      procedure: "Rejuvenecimiento facial",
      lifetimeValue: 1200,
    },
  });

  await db.appointment.create({
    data: {
      organizationId: org.id,
      patientId: patient.id,
      scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      status: "COMPLETED",
      bookedVia: "ai_whatsapp",
    },
  });

  console.log("Seed complete.");
  console.log(`Organización: ${org.name} (${org.slug})`);
  console.log(`Password de todos los usuarios demo: ${DEMO_PASSWORD}`);
  console.log("Usuarios:");
  for (const u of usersByRole) console.log(`  - ${u.role}: ${u.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
