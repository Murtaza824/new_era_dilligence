"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Ban, Plus, Building2, FileText, FileCheck, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CompanyLogo } from "@/components/company-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { companies as companiesApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Company } from "@/types";

type StatusFilter = "active" | "passed" | "all";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "passed", label: "Passed" },
  { value: "all", label: "All" },
];

export default function CompaniesPage() {
  const { user, loading: authLoading } = useAuth();
  const [list, setList] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [newName, setNewName] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = statusFilter === "all" ? undefined : { status: statusFilter };
    companiesApi
      .list(params)
      .then(setList)
      .catch(() => toast.error("Failed to load companies"))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    if (!authLoading && user) load();
    else if (!authLoading && !user) setLoading(false);
  }, [authLoading, user, load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await companiesApi.create({
        name: newName.trim(),
        ...(newWebsite.trim() && { website: newWebsite.trim() }),
      });
      if (statusFilter === "active" || statusFilter === "all") {
        setList((prev) => [created, ...prev]);
      }
      setNewName("");
      setNewWebsite("");
      setShowForm(false);
      toast.success("Company created");
    } catch {
      toast.error("Failed to create company");
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (company: Company, newStatus: string) => {
    try {
      const updated = await companiesApi.updateStatus(company.id, newStatus);
      if (statusFilter === "all") {
        setList((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        setList((prev) => prev.filter((c) => c.id !== company.id));
      }
      const labels: Record<string, string> = { active: "reactivated", passed: "marked as passed" };
      toast.success(`"${company.name}" ${labels[newStatus] ?? "updated"}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="container mx-auto max-w-5xl px-6 pt-10 pb-20">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Active Deals
          </h1>
          <p className="text-muted-foreground mt-1">
            Deals you&apos;re actively digging into. Materials persist on company profiles.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 size-4" />
          Add Company
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border bg-muted p-1 w-fit">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatusFilter(t.value)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              statusFilter === t.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-8 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <Input
            placeholder="Company name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="max-w-xs"
          />
          <Input
            placeholder="Website (optional — logo will be fetched)"
            value={newWebsite}
            onChange={(e) => setNewWebsite(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="max-w-sm"
          />
          <Button onClick={handleCreate} disabled={creating || !newName.trim()} size="sm">
            {creating ? "Creating…" : "Create"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border bg-card p-5 shadow-sm"
            >
              <div className="mb-3 h-5 w-2/3 rounded bg-muted" />
              <div className="mb-2 flex gap-4">
                <div className="h-4 w-16 rounded bg-muted" />
                <div className="h-4 w-12 rounded bg-muted" />
              </div>
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && list.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-20">
          <Building2 className="text-muted-foreground mb-4 size-12" />
          <p className="text-muted-foreground text-lg">
            {statusFilter === "active" ? "No active deals." : `No ${statusFilter} companies.`}
          </p>
          <p className="text-muted-foreground text-sm">
            {statusFilter === "active"
              ? "Click \"Add Company\" or promote from Dealflow to start digging in."
              : "Companies you archive or pass on will appear here."}
          </p>
        </div>
      )}

      {/* Company grid */}
      {!loading && list.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group relative rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-foreground/20",
                c.deal_status === "passed" && "opacity-60",
              )}
            >
              {/* Action buttons */}
              <div className="absolute top-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                {c.deal_status === "active" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStatusChange(c, "passed"); }}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-orange-100 hover:text-orange-600 dark:hover:bg-orange-900/30"
                    title="Pass on deal"
                  >
                    <Ban className="size-3.5" />
                  </button>
                )}
                {c.deal_status === "passed" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStatusChange(c, "active"); }}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-green-100 hover:text-green-600 dark:hover:bg-green-900/30"
                    title="Reactivate deal"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
                    companiesApi
                      .delete(c.id)
                      .then(() => {
                        setList((prev) => prev.filter((x) => x.id !== c.id));
                        toast.success(`"${c.name}" deleted`);
                      })
                      .catch(() => toast.error("Failed to delete company"));
                  }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Delete company"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              <Link href={`/dealroom/${c.id}`} className="flex gap-3">
                <CompanyLogo name={c.name} logoUrl={c.logo_url ?? null} size="md" />
                <div className="min-w-0">
                <h3 className="font-display text-lg font-semibold group-hover:underline">
                  {c.name}
                </h3>
                {c.deal_status !== "active" && (
                  <span className={cn(
                    "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    c.deal_status === "passed" && "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                  )}>
                    {c.deal_status}
                  </span>
                )}
                <div className="text-muted-foreground mt-2 flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <FileText className="size-3.5" />
                    {c.document_count} doc{c.document_count !== 1 ? "s" : ""}
                  </span>
                  {c.has_memo && (
                    <span className="flex items-center gap-1 text-green-600">
                      <FileCheck className="size-3.5" />
                      Memo
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-1.5 text-xs">
                  Added {new Date(c.created_at).toLocaleDateString()}
                </p>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
