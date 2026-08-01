import { db, CRMStage, AppointmentStatus } from "@/lib/db";

export interface DashboardRange {
  from: Date;
  to: Date;
}

function defaultRange(): DashboardRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from, to };
}

export async function getDashboardKpis(organizationId: string, range: DashboardRange = defaultRange()) {
  const where = { organizationId, createdAt: { gte: range.from, lte: range.to } };

  const [newPatients, totalLeads, campaigns, appointmentsByStatus, stageBreakdown, patientsValue] =
    await Promise.all([
      db.patient.count({ where }),
      db.lead.count({ where }),
      db.campaign.findMany({ where: { organizationId }, select: { costTotal: true, channel: true } }),
      db.appointment.groupBy({
        by: ["status"],
        where: { organizationId, createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      }),
      db.lead.groupBy({
        by: ["stage"],
        where: { organizationId },
        _count: { _all: true },
      }),
      db.patient.aggregate({
        where,
        _sum: { lifetimeValue: true },
      }),
    ]);

  const totalAdSpend = campaigns.reduce((sum, c) => sum + Number(c.costTotal), 0);
  const totalSales = Number(patientsValue._sum.lifetimeValue ?? 0);

  const costPerLead = totalLeads > 0 ? totalAdSpend / totalLeads : 0;
  const costPerPatient = newPatients > 0 ? totalAdSpend / newPatients : 0;
  const roas = totalAdSpend > 0 ? totalSales / totalAdSpend : 0;

  const appointmentsCount = (status: AppointmentStatus) =>
    appointmentsByStatus.find((a) => a.status === status)?._count._all ?? 0;

  const funnel = Object.values(CRMStage).map((stage) => ({
    stage,
    count: stageBreakdown.find((s) => s.stage === stage)?._count._all ?? 0,
  }));

  return {
    range,
    newPatients,
    totalLeads,
    costPerLead,
    costPerPatient,
    roas,
    totalSales,
    totalAdSpend,
    appointments: {
      scheduled: appointmentsCount(AppointmentStatus.SCHEDULED) + appointmentsCount(AppointmentStatus.CONFIRMED),
      completed: appointmentsCount(AppointmentStatus.COMPLETED),
      canceled: appointmentsCount(AppointmentStatus.CANCELED) + appointmentsCount(AppointmentStatus.NO_SHOW),
    },
    funnel,
  };
}
