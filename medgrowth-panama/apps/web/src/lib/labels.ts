import { CRMStage } from "@/lib/db";

export const STAGE_LABELS: Record<CRMStage, string> = {
  LEAD: "Lead",
  CONTACTED: "Contactado",
  QUALIFIED: "Calificado",
  QUOTED: "Cotización",
  APPOINTMENT_SCHEDULED: "Cita Agendada",
  PATIENT: "Paciente",
  NOT_INTERESTED: "No Interesado",
  LOST: "Perdido",
};

export const ACTIVE_PIPELINE_STAGES: CRMStage[] = [
  CRMStage.LEAD,
  CRMStage.CONTACTED,
  CRMStage.QUALIFIED,
  CRMStage.QUOTED,
  CRMStage.APPOINTMENT_SCHEDULED,
  CRMStage.PATIENT,
];

export const TERMINAL_STAGES: CRMStage[] = [CRMStage.NOT_INTERESTED, CRMStage.LOST];

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-PA", { style: "currency", currency: "USD" }).format(value);
}
