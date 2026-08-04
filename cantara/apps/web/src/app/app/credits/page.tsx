import type { Metadata } from 'next';
import { CREDIT_COSTS } from '@cantara/shared';
import { api } from '@/lib/api';
import { forwardedCookie } from '@/lib/server';
import { Card } from '@/components/ui';
import { CreditPacks } from './CreditPacks';

export const metadata: Metadata = { title: 'Créditos' };

export default async function CreditsPage() {
  const { balance, packs, history } = await api.credits(await forwardedCookie());

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">Créditos</h1>
        <p className="mt-2 text-ink-400">
          Tienes <strong className="text-accent-300 tabular-nums">{balance}</strong> créditos
          disponibles.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Qué cuesta cada cosa</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PriceItem label="Canción completa" cost={CREDIT_COSTS.songGeneration} note="hasta 3 min" />
          <PriceItem label="Regenerar" cost={CREDIT_COSTS.regeneration} note="reutiliza la letra" />
          <PriceItem label="Entrenar voz" cost={CREDIT_COSTS.voiceTraining} note="pago único" />
          <PriceItem label="Voz instantánea" cost={CREDIT_COSTS.instantVoice} note="sin entrenar" />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Conseguir créditos</h2>
        <CreditPacks packs={packs} />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Movimientos</h2>

        {history.length === 0 ? (
          <p className="text-sm text-ink-600">Aún no hay movimientos.</p>
        ) : (
          <Card className="divide-y divide-ink-850 p-0">
            {history.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-100">{entry.description}</p>
                  <p className="text-xs text-ink-600">
                    {new Date(entry.createdAt).toLocaleString('es-ES', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`font-mono text-sm tabular-nums ${
                      entry.amount > 0 ? 'text-success' : 'text-ink-300'
                    }`}
                  >
                    {entry.amount > 0 ? '+' : ''}
                    {entry.amount}
                  </p>
                  <p className="text-xs text-ink-700 tabular-nums">saldo {entry.balanceAfter}</p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function PriceItem({ label, cost, note }: { label: string; cost: number; note: string }) {
  return (
    <div className="surface p-4">
      <p className="text-sm text-ink-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-accent-300 tabular-nums">{cost}</p>
      <p className="mt-0.5 text-xs text-ink-700">{note}</p>
    </div>
  );
}
