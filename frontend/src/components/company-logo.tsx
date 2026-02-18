"use client";

import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

interface CompanyLogoProps {
  name: string;
  logoUrl: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
};

export function CompanyLogo({ name, logoUrl, size = "md", className }: CompanyLogoProps) {
  const sizeClass = sizeClasses[size];
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={cn("rounded-lg object-cover shrink-0", sizeClass, className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-muted font-medium text-muted-foreground",
        sizeClass,
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
