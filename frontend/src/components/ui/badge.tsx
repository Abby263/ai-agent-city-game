import * as React from "react";

import { cn } from "@/lib/utils";

export function Badge({
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--panel-strong))] px-2 py-0.5 text-xs text-[rgb(var(--foreground))]",
        className,
      )}
    >
      {children}
    </div>
  );
}
