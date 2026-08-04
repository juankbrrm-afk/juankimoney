import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GENRE_PROFILES, LANGUAGE_LABELS, type Genre, type Language } from '@cantara/shared';
import { api, ApiError } from '@/lib/api';
import { forwardedCookie, requireUser } from '@/lib/server';
import { SongDetail } from './SongDetail';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  try {
    const { id } = await params;
    const { song } = await api.getSong(id, await forwardedCookie());
    return { title: song.title };
  } catch {
    return { title: 'Canción' };
  }
}

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/app/songs/${id}`);

  let song;
  try {
    ({ song } = await api.getSong(id, await forwardedCookie()));
  } catch (error) {
    // Un 404 debe dar la página de no-encontrado de Next, no una pantalla de
    // error genérica: el usuario pudo llegar desde un enlace antiguo.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/songs" className="text-sm text-ink-600 hover:text-ink-300">
          ← Mis canciones
        </Link>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{song.title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-600">
          <span>{GENRE_PROFILES[song.genre as Genre]?.label ?? song.genre}</span>
          <span aria-hidden>·</span>
          <span>{LANGUAGE_LABELS[song.language as Language] ?? song.language}</span>
          <span aria-hidden>·</span>
          <span>{song.bpm} bpm</span>
          {song.voiceModelName && (
            <>
              <span aria-hidden>·</span>
              <span>voz: {song.voiceModelName}</span>
            </>
          )}
        </p>
        <p className="mt-3 max-w-2xl text-pretty text-ink-400">{song.prompt}</p>
      </div>

      <SongDetail song={song} balance={user.credits} />
    </div>
  );
}
