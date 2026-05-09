import { cn } from "@/lib/utils";

export type ProgressTone = "accent" | "warning" | "danger" | "water" | "success" | "violet";

export function Progress({
  value,
  tone = "accent",
  glow = false,
  height = 8,
}: {
  value: number;
  tone?: ProgressTone;
  glow?: boolean;
  height?: number;
}) {
  const color = {
    accent: "bg-[rgb(var(--accent))]",
    warning: "bg-[rgb(var(--warning))]",
    danger: "bg-[rgb(var(--danger))]",
    water: "bg-[rgb(var(--water))]",
    success: "bg-[rgb(var(--success))]",
    violet: "bg-[rgb(var(--violet))]",
  }[tone];
  const glowClass = {
    accent: "shadow-[0_0_10px_rgba(56,189,248,0.55)]",
    warning: "shadow-[0_0_10px_rgba(251,146,60,0.55)]",
    danger: "shadow-[0_0_10px_rgba(244,89,89,0.55)]",
    water: "shadow-[0_0_10px_rgba(56,189,248,0.55)]",
    success: "shadow-[0_0_10px_rgba(74,222,128,0.55)]",
    violet: "shadow-[0_0_10px_rgba(167,139,250,0.55)]",
  }[tone];
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-black/45 ring-1 ring-inset ring-white/[0.04]"
      style={{ height }}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", color, glow && glowClass)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
