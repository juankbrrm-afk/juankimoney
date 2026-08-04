import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/server';
import { VoiceStudio } from './VoiceStudio';

export const metadata: Metadata = { title: 'Nueva voz' };

export default async function NewVoicePage() {
  const user = await requireUser('/app/voices/new');

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/voices" className="text-sm text-ink-600 hover:text-ink-300">
          ← Mis voces
        </Link>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Entrena tu voz</h1>
        <p className="mt-2 max-w-2xl text-ink-400">
          Cuanto más limpia sea la grabación, mejor cantará tu modelo. Busca una habitación
          silenciosa, aleja el micrófono un palmo y habla con naturalidad.
        </p>
      </div>

      <VoiceStudio balance={user.credits} />
    </div>
  );
}
