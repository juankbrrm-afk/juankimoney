'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { formatPrice } from '@cantara/shared';
import { api, ApiError } from '@/lib/api';
import { Alert, Badge, Button } from '@/components/ui';

interface Pack {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  description: string;
  highlight?: boolean;
}

/**
 * Packs de créditos.
 *
 * La pasarela de pago no está integrada —requiere credenciales y una cuenta
 * verificada— pero todo lo que la rodea sí: packs, ledger e idempotencia. En
 * desarrollo la compra se simula; en producción la API responde 501 y aquí se
 * muestra ese mensaje tal cual, sin fingir que el pago funcionó.
 */
export function CreditPacks({ packs }: { packs: Pack[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(packId: string) {
    setError(null);
    setPending(packId);

    try {
      await api.purchaseCredits(packId);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo completar la compra.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="warning">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        {packs.map((pack) => (
          <div
            key={pack.id}
            className={clsx(
              'surface relative flex flex-col p-6',
              pack.highlight && 'border-accent-500/50 ring-1 ring-accent-500/20',
            )}
          >
            {pack.highlight && (
              <span className="absolute -top-2.5 left-6">
                <Badge tone="accent">Mejor precio</Badge>
              </span>
            )}

            <h3 className="font-semibold">{pack.name}</h3>
            <p className="mt-3 text-3xl font-semibold tabular-nums">
              {pack.credits}
              <span className="ml-1.5 text-sm font-normal text-ink-600">créditos</span>
            </p>
            <p className="mt-1 text-sm text-ink-400">{pack.description}</p>

            <p className="mt-5 text-2xl font-semibold">{formatPrice(pack.priceCents)}</p>
            <p className="text-xs text-ink-700">
              {(pack.priceCents / pack.credits).toFixed(2)} céntimos por crédito
            </p>

            <Button
              className="mt-6"
              variant={pack.highlight ? 'primary' : 'secondary'}
              fullWidth
              onClick={() => buy(pack.id)}
              loading={pending === pack.id}
              disabled={pending !== null}
            >
              Comprar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
