"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { STAGE_LABELS, ACTIVE_PIPELINE_STAGES, TERMINAL_STAGES } from "@/lib/labels";
import type { CRMStage } from "@/lib/db";

export interface KanbanLead {
  id: string;
  name: string;
  phone: string;
  stage: CRMStage;
  score: number | null;
  assignedTo: { name: string } | null;
}

export function KanbanBoard({ leads }: { leads: KanbanLead[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);

  async function moveLead(leadId: string, stage: CRMStage) {
    startTransition(async () => {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      router.refresh();
    });
  }

  const columns = [...ACTIVE_PIPELINE_STAGES, ...(showTerminal ? TERMINAL_STAGES : [])];

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowTerminal((v) => !v)}
        className="text-xs font-medium text-slate-500 underline"
      >
        {showTerminal ? "Ocultar" : "Mostrar"} No interesado / Perdido
      </button>

      <div className="flex gap-4 overflow-x-auto pb-4" style={{ opacity: isPending ? 0.6 : 1 }}>
        {columns.map((stage) => {
          const stageLeads = leads.filter((l) => l.stage === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingId) moveLead(draggingId, stage);
              }}
              className="w-64 flex-shrink-0 rounded-lg bg-slate-100 p-3"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-slate-700">{STAGE_LABELS[stage]}</h3>
                <span className="text-xs text-slate-400">{stageLeads.length}</span>
              </div>
              <div className="space-y-2">
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={() => setDraggingId(lead.id)}
                    onDragEnd={() => setDraggingId(null)}
                    className="cursor-grab rounded-md border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"
                  >
                    <Link href={`/leads/${lead.id}`} className="block">
                      <p className="text-sm font-medium text-slate-900">{lead.name}</p>
                      <p className="text-xs text-slate-400">{lead.phone}</p>
                      <div className="mt-2 flex items-center justify-between">
                        {lead.score !== null && (
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                            Score {lead.score}
                          </span>
                        )}
                        {lead.assignedTo && (
                          <span className="text-[11px] text-slate-400">{lead.assignedTo.name}</span>
                        )}
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
