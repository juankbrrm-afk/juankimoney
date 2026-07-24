import { CATEGORIES, type Place } from "@/lib/types";

export function PlaceForm({
  place,
  action,
  submitLabel,
}: {
  place?: Place;
  action: (formData: FormData) => void;
  submitLabel: string;
}) {
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <Field label="Nombre">
        <input name="name" defaultValue={place?.name} required className="input" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Categoría">
          <select name="category" defaultValue={place?.category ?? "restaurant"} className="input">
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select name="status" defaultValue={place?.status ?? "draft"} className="input">
            <option value="draft">Borrador</option>
            <option value="published">Publicado</option>
            <option value="archived">Archivado</option>
          </select>
        </Field>
      </div>

      <Field label="Zona">
        <input name="zone" defaultValue={place?.zone} required className="input" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Nivel de precio (1-4)">
          <input name="priceLevel" type="number" min={1} max={4} defaultValue={place?.priceLevel ?? 2} className="input" />
        </Field>
        <Field label="Rating promedio">
          <input name="avgRating" type="number" step="0.1" min={0} max={5} defaultValue={place?.avgRating ?? 4.5} className="input" />
        </Field>
      </div>

      <Field label="Horario">
        <input name="hours" defaultValue={place?.hours} placeholder="Todos los días 09:00-18:00" className="input" />
      </Field>

      <Field label="Descripción">
        <textarea name="description" defaultValue={place?.description} rows={3} required className="input" />
      </Field>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input name="kidsFriendly" type="checkbox" defaultChecked={place?.kidsFriendly} />
        Apto para niños
      </label>

      <fieldset className="rounded-xl border border-stone-200 p-4">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-stone-600">Contacto</legend>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Teléfono">
            <input name="phone" defaultValue={place?.contacts.phone} className="input" />
          </Field>
          <Field label="WhatsApp">
            <input name="whatsapp" defaultValue={place?.contacts.whatsapp} className="input" />
          </Field>
          <Field label="Instagram">
            <input name="instagram" defaultValue={place?.contacts.instagram} className="input" />
          </Field>
          <Field label="Website">
            <input name="website" defaultValue={place?.contacts.website} className="input" />
          </Field>
        </div>
      </fieldset>

      <button type="submit" className="mt-2 self-start rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white">
        {submitLabel}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-ink">
      <span className="text-xs font-medium text-stone-600">{label}</span>
      {children}
    </label>
  );
}
