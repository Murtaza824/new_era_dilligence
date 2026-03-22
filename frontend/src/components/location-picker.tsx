"use client";

import { useEffect, useRef, useState } from "react";

import type { LocationItem } from "@/lib/api";
import { cn } from "@/lib/utils";

export type LocationPickerVariant = "filter" | "field";

type LocationPickerProps = {
  locations: LocationItem[];
  value: string;
  onChange: (v: string) => void;
  onAdd: (name: string) => Promise<void>;
  variant?: LocationPickerVariant;
  className?: string;
  /** For associating with a <label htmlFor> */
  buttonId?: string;
};

/**
 * Combobox: pick from saved locations, search, or add a new one (creates via onAdd).
 * - filter: empty = "All locations" (table filters)
 * - field: empty = "Select or add location…" (forms)
 */
export function LocationPicker({
  locations,
  value,
  onChange,
  onAdd,
  variant = "filter",
  className,
  buttonId,
}: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const emptyLabel = variant === "filter" ? "All locations" : "Select or add location…";
  const clearLabel = variant === "filter" ? "All locations" : "—";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = draft.trim()
    ? locations.filter((l) => l.name.toLowerCase().includes(draft.toLowerCase()))
    : locations;
  const exactMatch = locations.some((l) => l.name.toLowerCase() === draft.trim().toLowerCase());

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        id={buttonId}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="rounded-md border bg-background px-3 py-2 text-sm min-w-[160px] w-full max-w-[220px] text-left"
      >
        <span className={cn(!value && "text-muted-foreground")}>{value || emptyLabel}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-md border bg-card shadow-lg">
          <div className="p-2">
            <input
              type="text"
              placeholder="Search or add new…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              onKeyDown={async (e) => {
                if (e.key === "Enter" && draft.trim() && !exactMatch) {
                  e.preventDefault();
                  await onAdd(draft.trim());
                  setDraft("");
                  setOpen(false);
                }
              }}
            />
          </div>
          <div className="max-h-48 overflow-y-auto border-t">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
                setDraft("");
              }}
              className={cn(
                "w-full px-3 py-1.5 text-left text-sm hover:bg-muted",
                !value && "font-medium text-foreground",
              )}
            >
              {clearLabel}
            </button>
            {filtered.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  onChange(l.name);
                  setOpen(false);
                  setDraft("");
                }}
                className={cn(
                  "w-full px-3 py-1.5 text-left text-sm hover:bg-muted",
                  value === l.name && "font-medium text-foreground",
                )}
              >
                {l.name}
              </button>
            ))}
            {draft.trim() && !exactMatch && (
              <button
                type="button"
                onClick={async () => {
                  await onAdd(draft.trim());
                  setDraft("");
                  setOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-primary hover:bg-muted"
              >
                + Add &quot;{draft.trim()}&quot;
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
