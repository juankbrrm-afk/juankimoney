import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export function Panel({
  title,
  hint,
  actions,
  children,
  className,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5",
        className
      )}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold tracking-[0.18em] text-neutral-400 uppercase">
            {title}
          </h2>
          {hint && <p className="mt-1 max-w-prose text-sm text-neutral-500">{hint}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "record";
  active?: boolean;
};

export function Button({ variant = "ghost", active, className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={clsx(
        "rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-lime-400 text-neutral-950 hover:bg-lime-300",
        variant === "danger" && "bg-red-500 text-white hover:bg-red-400",
        variant === "record" && "bg-red-600 text-white hover:bg-red-500",
        variant === "ghost" &&
          (active
            ? "bg-neutral-100 text-neutral-950"
            : "border border-neutral-700 text-neutral-200 hover:border-neutral-500 hover:text-white"),
        className
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold tracking-[0.16em] text-neutral-500 uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-neutral-600">{hint}</span>}
    </label>
  );
}

export function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2">
      <div className="text-[10px] tracking-[0.16em] text-neutral-500 uppercase">{label}</div>
      <div
        className={clsx(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "good" && "text-lime-400",
          tone === "warn" && "text-amber-400",
          tone === "bad" && "text-red-400",
          tone === "neutral" && "text-neutral-100"
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function Meter({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
      <div
        className={clsx(
          "h-full transition-[width] duration-75",
          pct > 92 ? "bg-red-500" : pct > 70 ? "bg-amber-400" : "bg-lime-400"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
