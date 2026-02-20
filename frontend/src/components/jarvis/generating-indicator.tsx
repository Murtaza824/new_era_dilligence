"use client";

import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function GeneratingIndicator({
  label = "Generating…",
  className,
  size = "md",
}: Props) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5",
        size === "sm" && "gap-1.5 px-2 py-1 text-xs",
        size === "md" && "text-sm",
        size === "lg" && "gap-2.5 px-4 py-2 text-base",
        className,
      )}
    >
      <Sparkles className={cn(
        "text-primary animate-pulse",
        size === "sm" && "size-3",
        size === "md" && "size-4",
        size === "lg" && "size-5",
      )} />
      <span className="font-medium text-primary">{label}</span>
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block size-1 rounded-full bg-primary"
            style={{
              animation: "pulse 1.4s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </span>
    </div>
  );
}

export function GeneratingShimmer({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-primary/5 to-transparent" />
      <style jsx>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
