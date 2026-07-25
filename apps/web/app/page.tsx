import Link from "next/link";
import { ChatCanvas } from "@/components/ChatCanvas";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:py-16">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-accent">Panama AI</p>
          <h1 className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl">
            Tu concierge de viaje en Panamá
          </h1>
          <p className="mt-3 text-stone-600">
            Dime dónde estás, cuánto tiempo tienes y qué te gusta — te armo el plan con lugares
            reales, no una lista genérica.
          </p>
        </div>
        <Link
          href="/explorar"
          className="flex-none whitespace-nowrap rounded-full border border-stone-200 px-4 py-2 text-sm text-ink hover:border-accent hover:text-accent"
        >
          Explorar sin chat
        </Link>
      </header>
      <ChatCanvas />
    </main>
  );
}
