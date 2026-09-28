// Shared button looks, so every screen uses the same few calm styles.

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "xl";

const base =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong",
  secondary: "border border-border-strong bg-surface-2 text-text hover:border-accent hover:text-accent-strong",
  ghost: "text-muted hover:bg-surface-2 hover:text-text",
  danger: "border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20",
};

const sizes: Record<Size, string> = {
  md: "min-h-11 px-4 text-base",
  lg: "min-h-14 px-6 text-lg",
  xl: "min-h-18 px-8 text-xl",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra = ""): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
}
