import * as React from "react";

import { cn } from "@/lib/utils";

type Tone = "default" | "accent" | "warning" | "danger" | "success" | "violet";

const tones: Record<Tone, string> = {
  default: "border-[rgba(var(--border),0.85)] bg-[rgba(var(--panel-strong),0.85)] text-[rgb(var(--muted-strong))]",
  accent: "border-[rgba(56,189,248,0.55)] bg-[rgba(56,189,248,0.14)] text-[rgb(125,211,252)]",
  warning: "border-[rgba(251,191,36,0.55)] bg-[rgba(251,191,36,0.14)] text-[rgb(252,211,77)]",
  danger: "border-[rgba(244,89,89,0.55)] bg-[rgba(244,89,89,0.14)] text-[rgb(252,165,165)]",
  success: "border-[rgba(74,222,128,0.5)] bg-[rgba(74,222,128,0.14)] text-[rgb(134,239,172)]",
  violet: "border-[rgba(167,139,250,0.55)] bg-[rgba(167,139,250,0.14)] text-[rgb(196,181,253)]",
};

export function Badge({
  className,
  children,
  tone = "default",
}: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
