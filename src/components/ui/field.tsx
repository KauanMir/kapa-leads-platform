import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const control =
  "block w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-foreground shadow-xs transition-[border-color,box-shadow] duration-150 " +
  "placeholder:text-subtle hover:border-[#c3c9d4] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted " +
  "aria-[invalid=true]:border-danger";

export function Label({ className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`mb-1.5 block text-[13px] font-medium text-foreground-soft ${className}`} {...props} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${control} h-10 ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${control} select-chevron h-10 cursor-pointer pr-9 ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${control} py-2.5 leading-relaxed ${className}`} {...props} />;
}

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 text-[13px] font-medium text-danger">
      {children}
    </p>
  );
}

export function FieldHint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-[13px] leading-snug text-muted">
      {children}
    </p>
  );
}

/** Caixa de seleção com texto (alvo de toque grande, borda ao marcar). */
export function CheckboxCard({ tone = "default", children, ...props }: InputHTMLAttributes<HTMLInputElement> & { tone?: "default" | "danger"; children: ReactNode }) {
  const checked = tone === "danger" ? "has-[:checked]:border-danger/35 has-[:checked]:bg-danger-soft/60" : "has-[:checked]:border-accent-line has-[:checked]:bg-accent-soft/60";
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 text-sm transition-colors hover:bg-surface-muted ${checked}`}>
      <input type="checkbox" className={`mt-0.5 size-4 shrink-0 ${tone === "danger" ? "accent-danger" : "accent-accent"}`} {...props} />
      <span className="min-w-0">{children}</span>
    </label>
  );
}
