import { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      neutral: "bg-accent/25 text-primary",
      draft: "bg-muted/15 text-muted",
      review: "bg-warning/15 text-warning",
      success: "bg-success/15 text-success",
      danger: "bg-danger/15 text-danger",
      primary: "bg-primary/10 text-primary",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "draft",
  TRANSCRIBED: "neutral",
  AI_GENERATED: "review",
  IN_REVIEW: "review",
  FINALIZED: "success",
  ARCHIVED: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "neutral"}>{status.replace(/_/g, " ")}</Badge>;
}
