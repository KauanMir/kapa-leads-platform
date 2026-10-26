import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerSolid" | "whatsapp";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-xs hover:bg-accent-hover active:bg-accent-hover disabled:bg-accent/55",
  secondary:
    "border border-line-strong bg-surface text-foreground shadow-xs hover:border-[#c3c9d4] hover:bg-surface-muted active:bg-surface-sunken disabled:text-muted",
  ghost: "text-foreground-soft hover:bg-surface-sunken hover:text-foreground disabled:text-muted",
  danger: "border border-danger/25 bg-surface text-danger shadow-xs hover:border-danger/40 hover:bg-danger-soft disabled:opacity-60",
  // Só para a confirmação final de uma ação destrutiva.
  dangerSolid: "bg-danger text-white shadow-xs hover:bg-danger/90 disabled:bg-danger/55",
  whatsapp: "bg-whatsapp text-white shadow-xs hover:bg-whatsapp-hover active:bg-whatsapp-hover",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg [&>svg]:size-4",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-5 text-[15px] gap-2.5 rounded-xl",
};

/** Classes de botão — também usadas em <Link> e <a>. */
export function buttonClasses({ variant = "primary", size = "md", className = "" }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return `inline-flex shrink-0 items-center justify-center whitespace-nowrap font-semibold transition-[background-color,border-color,color] duration-150 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}
