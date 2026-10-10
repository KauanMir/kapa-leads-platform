import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover disabled:bg-accent/60",
  secondary: "border border-line-strong bg-surface text-foreground hover:bg-background disabled:text-muted",
  ghost: "text-foreground hover:bg-background disabled:text-muted",
  danger: "border border-danger/30 bg-surface text-danger hover:bg-danger-soft disabled:opacity-60",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

/** Classes de botão — também usadas em <Link> e <a>. */
export function buttonClasses({ variant = "primary", size = "md", className = "" }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return `inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
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
