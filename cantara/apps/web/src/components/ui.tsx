/**
 * Primitivas de interfaz.
 *
 * Construidas a mano en lugar de importar una librería de componentes porque
 * el brief pide una estética propia y una librería completa impondría la
 * suya. Lo que sí se respeta es lo que no se debe reinventar: estados de
 * foco visibles, etiquetas asociadas, `aria-*` en los controles con estado y
 * áreas táctiles suficientes en móvil.
 */

import clsx from 'clsx';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

// ── Botón ────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-accent-500 to-accent-600 text-white shadow-lg shadow-accent-600/20 hover:from-accent-400 hover:to-accent-500 active:scale-[0.98]',
  secondary:
    'bg-ink-800 text-ink-100 border border-ink-700 hover:bg-ink-700 hover:border-ink-600 active:scale-[0.98]',
  ghost: 'text-ink-300 hover:text-ink-100 hover:bg-ink-850',
  danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // 44px de alto mínimo en móvil: por debajo, el objetivo táctil falla.
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-base gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      // Se anuncia el estado ocupado además de deshabilitar: un lector de
      // pantalla debe saber que la acción está en curso, no solo que el
      // botón dejó de responder.
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center rounded-[--radius-control] font-medium',
        'transition-all duration-200 ease-[--ease-out-soft]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Superficies ──────────────────────────────────────────────

export function Card({
  className,
  children,
  as: Tag = 'div',
}: {
  className?: string;
  children: ReactNode;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return <Tag className={clsx('surface p-5 sm:p-6', className)}>{children}</Tag>;
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}) {
  const tones = {
    neutral: 'bg-ink-800 text-ink-300 border-ink-700',
    accent: 'bg-accent-600/15 text-accent-300 border-accent-600/30',
    success: 'bg-success/15 text-success border-success/30',
    warning: 'bg-warning/15 text-warning border-warning/30',
    danger: 'bg-danger/15 text-danger border-danger/30',
  } as const;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

// ── Campos de formulario ─────────────────────────────────────

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor: string;
}

export function Field({ label, hint, error, required, children, htmlFor }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-300">
        {label}
        {required && (
          <span className="ml-1 text-accent-400" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {/* `role="alert"` hace que el error se anuncie al aparecer, en lugar de
          quedarse en pantalla sin que un lector de pantalla lo note. */}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-600">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL_CLASS =
  'w-full rounded-[--radius-control] border bg-ink-900 px-3.5 text-ink-100 placeholder:text-ink-600 transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25 disabled:opacity-50';

export function Input({
  className,
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${props.id}-error` : props.id ? `${props.id}-hint` : undefined}
      className={clsx(CONTROL_CLASS, 'h-11', invalid ? 'border-danger' : 'border-ink-700', className)}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || undefined}
      className={clsx(
        CONTROL_CLASS,
        'min-h-28 resize-y py-3 leading-relaxed',
        invalid ? 'border-danger' : 'border-ink-700',
        className,
      )}
    />
  );
}

export function Select({
  className,
  invalid,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      {...props}
      aria-invalid={invalid || undefined}
      className={clsx(
        CONTROL_CLASS,
        'h-11 appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' stroke=\'%23a1a1aa\' stroke-width=\'2\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E")] bg-[length:18px] bg-[right_0.75rem_center] bg-no-repeat pr-10',
        invalid ? 'border-danger' : 'border-ink-700',
        className,
      )}
    >
      {children}
    </select>
  );
}

// ── Progreso ─────────────────────────────────────────────────

export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progreso'}
        className="h-2 overflow-hidden rounded-full bg-ink-800"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-500 to-warm-400 transition-[width] duration-500 ease-[--ease-out-soft]"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

// ── Estados vacíos y de error ────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[--radius-card] border border-dashed border-ink-800 px-6 py-14 text-center">
      <span className="mb-4 text-4xl" aria-hidden>
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-ink-100">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-400">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'warning' | 'info';
  children: ReactNode;
}) {
  const tones = {
    danger: 'border-danger/30 bg-danger/10 text-danger',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    info: 'border-accent-600/30 bg-accent-600/10 text-accent-300',
  } as const;

  return (
    <div role="alert" className={clsx('rounded-[--radius-control] border px-4 py-3 text-sm', tones[tone])}>
      {children}
    </div>
  );
}
