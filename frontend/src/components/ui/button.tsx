import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[rgb(var(--accent))] text-[#06121f] hover:bg-[rgb(125_211_252)] shadow-[0_6px_18px_rgba(56,189,248,0.32)]",
        secondary:
          "bg-[rgba(var(--panel-strong),0.85)] text-[rgb(var(--foreground))] border border-[rgba(var(--border),0.85)] hover:border-[rgba(var(--accent),0.55)] hover:bg-[rgba(var(--panel-hi),0.9)]",
        danger:
          "bg-[rgb(var(--danger))] text-white hover:bg-[rgb(248_113_113)] shadow-[0_6px_18px_rgba(244,89,89,0.32)]",
        ghost: "hover:bg-[rgba(var(--panel-strong),0.6)] text-[rgb(var(--muted-strong))]",
        warning:
          "bg-[rgb(var(--warning))] text-[#1a1004] hover:bg-[rgb(253_186_116)] shadow-[0_6px_18px_rgba(251,146,60,0.32)]",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-2.5 text-xs",
        icon: "h-9 w-9",
        xs: "h-7 px-2 text-[11px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
