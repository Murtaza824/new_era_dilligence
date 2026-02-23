"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";

import { Plus, Trash2, Briefcase, Pencil, Check, X, Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { portfolioApi } from "@/lib/api";
import type { PortfolioSimulationLatest, PortfolioSnapshot } from "@/types";

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt$(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

type EditingRow = {
  company_name: string;
  one_liner: string;
  website: string;
  investment_stage: string;
  investment_size: string;
  entry_valuation: string;
  last_valuation: string;
  ownership_pct: string;
  investment_date: string;
};

function rowToEditing(r: PortfolioSnapshot): EditingRow {
  return {
    company_name: r.company_name,
    one_liner: r.one_liner ?? "",
    website: r.website ?? "",
    investment_stage: r.investment_stage ?? "",
    investment_size: r.investment_size != null ? String(r.investment_size) : "",
    entry_valuation: r.entry_valuation != null ? String(r.entry_valuation) : "",
    last_valuation: r.last_valuation != null ? String(r.last_valuation) : "",
    ownership_pct: r.ownership_pct != null ? String(r.ownership_pct) : "",
    investment_date: r.investment_date ?? "",
  };
}

function editingToPayload(e: EditingRow): Record<string, unknown> {
  return {
    company_name: e.company_name || undefined,
    one_liner: e.one_liner || null,
    website: e.website || null,
    investment_stage: e.investment_stage || null,
    investment_size: e.investment_size ? parseFloat(e.investment_size) : null,
    entry_valuation: e.entry_valuation ? parseFloat(e.entry_valuation) : null,
    last_valuation: e.last_valuation ? parseFloat(e.last_valuation) : null,
    ownership_pct: e.ownership_pct ? parseFloat(e.ownership_pct) : null,
    investment_date: e.investment_date || null,
  };
}

export default function PortfolioPage() {
  const [rows, setRows] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestSim, setLatestSim] = useState<PortfolioSimulationLatest | null>(null);
  const [simRunning, setSimRunning] = useState(false);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<EditingRow | null>(null);
  const [saving, setSaving] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    portfolioApi
      .list()
      .then(setRows)
      .catch(() => toast.error("Failed to load portfolio"))
      .finally(() => setLoading(false));
  }, []);

  const loadLatestSim = useCallback(() => {
    portfolioApi.getLatestPortfolioSimulation().then(setLatestSim).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (rows.length > 0) loadLatestSim();
  }, [rows.length, loadLatestSim]);

  const handleRunPortfolioSim = async () => {
    setSimRunning(true);
    try {
      await portfolioApi.runPortfolioSimulation();
      loadLatestSim();
      toast.success("Portfolio simulation complete");
    } catch {
      toast.error("Portfolio simulation failed");
    } finally {
      setSimRunning(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await portfolioApi.create({ company_name: newName.trim() } as Partial<PortfolioSnapshot>);
      setRows((prev) => [created, ...prev]);
      setNewName("");
      setShowAdd(false);
      toast.success("Company added to portfolio");
    } catch {
      toast.error("Failed to add company");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from portfolio?`)) return;
    try {
      await portfolioApi.delete(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success(`"${name}" removed`);
    } catch {
      toast.error("Failed to remove");
    }
  };

  const startEdit = (row: PortfolioSnapshot) => {
    setEditingId(row.id);
    setEditingData(rowToEditing(row));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingData(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editingData) return;
    setSaving(true);
    try {
      const updated = await portfolioApi.update(editingId, editingToPayload(editingData) as Partial<PortfolioSnapshot>);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success("Updated");
      setEditingId(null);
      setEditingData(null);
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof EditingRow, value: string) => {
    if (!editingData) return;
    setEditingData({ ...editingData, [field]: value });
  };

  return (
    <div className="container mx-auto max-w-6xl px-6 pt-10 pb-20">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Portfolio
          </h1>
          <p className="text-muted-foreground mt-1">
            Current fund investments.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setShowAdd(!showAdd);
            setTimeout(() => nameInputRef.current?.focus(), 50);
          }}
        >
          <Plus className="mr-1.5 size-4" />
          Add Company
        </Button>
      </div>

      {/* Portfolio Health (latent-factor simulation) */}
      {!loading && rows.length > 0 && (
        <div className="mb-6 rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display flex items-center gap-2 text-base font-semibold">
              <Activity className="size-4" />
              Portfolio Health
            </h2>
            <Button
              size="sm"
              onClick={handleRunPortfolioSim}
              disabled={simRunning}
            >
              {simRunning ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : null}
              {simRunning ? "Running…" : "Run Portfolio Simulation"}
            </Button>
          </div>
          {latestSim?.outputs ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div
                  className={`rounded-lg border px-4 py-3 ${
                    latestSim.outputs.p_zero_outliers > 0.5
                      ? "border-amber-500/50 bg-amber-500/10"
                      : "border-emerald-500/50 bg-emerald-500/10"
                  }`}
                >
                  <p className="text-muted-foreground text-xs">P(zero outliers)</p>
                  <p className="text-xl font-bold">
                    {(latestSim.outputs.p_zero_outliers * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-muted-foreground text-xs">Expected outliers</p>
                  <p className="text-xl font-bold">
                    {latestSim.outputs.expected_outliers.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-muted-foreground text-xs">Diversification</p>
                  <p className="text-xl font-bold">
                    {(latestSim.outputs.diversification_score * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-muted-foreground text-xs">Last run</p>
                  <p className="text-sm font-medium">
                    {latestSim.run?.created_at
                      ? new Date(latestSim.run.created_at).toLocaleString()
                      : "—"}
                  </p>
                </div>
              </div>
              <p className="text-muted-foreground mt-4 max-w-2xl text-xs leading-relaxed">
                Each company gets a standalone outlier probability from its sector, geography, and founder type (or your override on the company page). When a company has linked diligence or portfolio notes, we use that context (RAG + AI) to suggest a probability for this run; otherwise we use the factor formula. We model correlation: outcomes share common factors, so breakout wins and wipeouts tend to cluster. We run 100k trials—in each, we draw shared factor returns and company-specific noise, then count how many companies clear their threshold. P(zero outliers) is the share of trials with none; expected outliers is the average count. Diversification is 1 minus mean pairwise correlation—higher means more spread across factors and less tail risk. Current events are not included.
              </p>
              {latestSim.outputs.per_company?.length > 0 && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
                    Most likely outliers
                  </h3>
                  <ul className="space-y-2">
                    {latestSim.outputs.per_company.map((pc) => (
                      <li
                        key={pc.company_id ?? pc.company_name}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm"
                      >
                        <Link
                          href={pc.company_id ? `/portfolio/${pc.company_id}` : "#"}
                          className="font-medium hover:underline"
                        >
                          {pc.company_name}
                        </Link>
                        <span className="text-muted-foreground font-mono text-xs">
                          {(pc.marginal_outlier_probability * 100).toFixed(1)}% marginal
                        </span>
                        <span className="text-muted-foreground w-full text-xs leading-snug sm:w-auto">
                          {pc.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Run a portfolio simulation to see P(zero outliers), expected
              outliers, and diversification score.
            </p>
          )}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <Input
            ref={nameInputRef}
            placeholder="Company name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="max-w-xs"
          />
          <Button onClick={handleAdd} disabled={creating || !newName.trim()} size="sm">
            {creating ? "Adding…" : "Add"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border bg-card" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-20">
          <Briefcase className="text-muted-foreground mb-4 size-12" />
          <p className="text-muted-foreground text-lg">No portfolio companies yet.</p>
          <p className="text-muted-foreground text-sm">
            Add companies here or use "Add to Portfolio" from a company&apos;s diligence page.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3 text-right">Check Size</th>
                <th className="px-4 py-3 text-right">Entry Val</th>
                <th className="px-4 py-3 text-right">Last Val</th>
                <th className="px-4 py-3 text-right">Ownership</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isEditing = editingId === r.id;

                if (isEditing && editingData) {
                  return (
                    <tr key={r.id} className="border-t bg-muted/30">
                      <td className="px-4 py-2">
                        <Input
                          value={editingData.company_name}
                          onChange={(e) => updateField("company_name", e.target.value)}
                          className="h-8 text-sm"
                        />
                        <Input
                          placeholder="One-liner…"
                          value={editingData.one_liner}
                          onChange={(e) => updateField("one_liner", e.target.value)}
                          className="mt-1 h-7 text-xs"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          placeholder="Stage…"
                          value={editingData.investment_stage}
                          onChange={(e) => updateField("investment_stage", e.target.value)}
                          className="h-8 w-24 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          placeholder="0"
                          value={editingData.investment_size}
                          onChange={(e) => updateField("investment_size", e.target.value)}
                          className="h-8 w-28 text-right text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          placeholder="0"
                          value={editingData.entry_valuation}
                          onChange={(e) => updateField("entry_valuation", e.target.value)}
                          className="h-8 w-28 text-right text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          placeholder="0"
                          value={editingData.last_valuation}
                          onChange={(e) => updateField("last_valuation", e.target.value)}
                          className="h-8 w-28 text-right text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={editingData.ownership_pct}
                          onChange={(e) => updateField("ownership_pct", e.target.value)}
                          className="h-8 w-20 text-right text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="date"
                          value={editingData.investment_date}
                          onChange={(e) => updateField("investment_date", e.target.value)}
                          className="h-8 w-32 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            className="rounded-md p-1.5 text-green-600 transition-colors hover:bg-green-100 dark:hover:bg-green-950"
                            title="Save"
                          >
                            <Check className="size-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-muted-foreground rounded-md p-1.5 transition-colors hover:bg-muted"
                            title="Cancel"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={r.id} className="group border-t">
                    <td className="px-4 py-3">
                      <Link
                        href={`/portfolio/${r.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.company_name}
                      </Link>
                      {r.one_liner && (
                        <div className="text-muted-foreground max-w-xs truncate text-xs">
                          {r.one_liner}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.investment_stage ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs whitespace-nowrap">
                          {titleCase(r.investment_stage)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {fmt$(r.investment_size)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {fmt$(r.entry_valuation)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {fmt$(r.last_valuation)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs" title={r.ownership_pct == null && r.effective_ownership_pct != null ? "Calculated from check size ÷ entry valuation" : undefined}>
                      {r.effective_ownership_pct != null
                        ? `${r.effective_ownership_pct.toFixed(2)}%${r.ownership_pct == null ? " (calc)" : ""}`
                        : "—"}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      {r.investment_date ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => startEdit(r)}
                          className="text-muted-foreground rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id, r.company_name)}
                          className="text-muted-foreground rounded-md p-1.5 transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title="Remove"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
