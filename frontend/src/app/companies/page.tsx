"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Plus, Building2, FileText, FileCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CompanyLogo } from "@/components/company-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { companies as companiesApi } from "@/lib/api";
import type { Company } from "@/types";

export default function CompaniesPage() {
  const { user, loading: authLoading } = useAuth();
  const [list, setList] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    companiesApi
      .list()
      .then(setList)
      .catch(() => toast.error("Failed to load companies"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!authLoading && user) load();
    else if (!authLoading && !user) setLoading(false);
  }, [authLoading, user, load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await companiesApi.create({
        name: newName.trim(),
        ...(newWebsite.trim() && { website: newWebsite.trim() }),
      });
      setNewName("");
      setNewWebsite("");
      setShowForm(false);
      load();
      toast.success("Company created");
    } catch {
      toast.error("Failed to create company");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container mx-auto max-w-5xl px-6 pt-10 pb-20">
      {/* Header */}
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Deal Room
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage deal pipeline and diligence materials.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 size-4" />
          Add Company
        </Button>
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
          <p className="text-muted-foreground text-lg">No companies yet.</p>
          <p className="text-muted-foreground text-sm">
            Click "Add Company" to get started.
          </p>
        </div>
      )}

      {/* Company grid */}
      {!loading && list.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <div
              key={c.id}
              className="group relative rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-foreground/20"
            >
              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
                  companiesApi
                    .delete(c.id)
                    .then(() => {
                      toast.success(`"${c.name}" deleted`);
                      load();
                    })
                    .catch(() => toast.error("Failed to delete company"));
                }}
                className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                title="Delete company"
              >
                <Trash2 className="size-4" />
              </button>

              <Link href={`/companies/${c.id}`} className="flex gap-3">
                <CompanyLogo name={c.name} logoUrl={c.logo_url ?? null} size="md" />
                <div className="min-w-0">
                <h3 className="font-display text-lg font-semibold group-hover:underline">
                  {c.name}
                </h3>
                <div className="text-muted-foreground mt-3 flex items-center gap-4 text-sm">
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
                <p className="text-muted-foreground mt-2 text-xs">
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
