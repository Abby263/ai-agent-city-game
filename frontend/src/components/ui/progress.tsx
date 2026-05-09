import { cn } from "@/lib/utils";

export function Progress({
  value,
  tone = "accent",
}: {
  value: number;
  tone?: "accent" | "warning" | "danger" | "water";
}) {
  const color = {
    accent: "bg-[rgb(var(--accent))]",
    warning: "bg-[rgb(var(--accent-2))]",
    danger: "bg-[rgb(var(--danger))]",
    water: "bg-[rgb(var(--water))]",
  }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-sm bg-black/35">
      <div className={cn("h-full", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
