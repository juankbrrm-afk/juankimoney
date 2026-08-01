import Link from "next/link";

const AUDIENCES = [
  "Cirujanos plásticos",
  "Dentistas",
  "Dermatólogos",
  "Clínicas estéticas",
  "Ginecólogos",
  "Ortopedistas",
  "Clínicas privadas",
];

const FEATURES = [
  { title: "CRM diseñado para clínicas", body: "Pipeline de leads a pacientes, con IA que califica y da seguimiento por ti." },
  { title: "Asistente de WhatsApp con IA", body: "Responde, califica y agenda consultas 24/7 — con barandas para nunca prometer resultados médicos." },
  { title: "Dashboard de ROI real", body: "CPL, CAC, ROAS y embudo por canal, no solo métricas de vanidad." },
  { title: "Landing pages que convierten", body: "Plantillas optimizadas por especialidad: estética, odontología, dermatología, fertilidad." },
];

export default function MarketingHome() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-950 to-brand-900 text-white">
      <div className="mx-auto max-w-5xl px-6 py-24 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-300">
          MedGrowth Panama
        </p>
        <h1 className="text-4xl font-bold leading-tight sm:text-6xl">
          Llenamos la agenda de tu clínica con pacientes calificados.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-brand-100">
          La plataforma de adquisición de pacientes con IA para clínicas privadas en
          Panamá — CRM, WhatsApp automatizado, landing pages y reportes de ROI en un
          solo lugar.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-brand-400 px-6 py-3 font-semibold text-brand-950 transition hover:bg-brand-300"
          >
            Entrar al dashboard
          </Link>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-2">
          {AUDIENCES.map((a) => (
            <span key={a} className="rounded-full border border-brand-700 px-4 py-1 text-sm text-brand-100">
              {a}
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-6 pb-24 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-brand-800 bg-brand-950/50 p-6">
            <h3 className="text-lg font-semibold text-brand-200">{f.title}</h3>
            <p className="mt-2 text-sm text-brand-100">{f.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
