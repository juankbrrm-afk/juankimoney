import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { forwardedCookie, requireUser } from '@/lib/server';
import { SongCreator } from './SongCreator';

export const metadata: Metadata = { title: 'Crear canción' };

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ voice?: string }>;
}) {
  const [user, cookie, params] = await Promise.all([
    requireUser('/app/create'),
    forwardedCookie(),
    searchParams,
  ]);

  const { voices } = await api.listVoices(cookie);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">Crear canción</h1>
        <p className="mt-2 max-w-2xl text-ink-400">
          Describe lo que buscas, elige el sonido y la generamos cantada con tu voz.
        </p>
      </div>

      <SongCreator voices={voices} balance={user.credits} initialVoiceId={params.voice} />
    </div>
  );
}
