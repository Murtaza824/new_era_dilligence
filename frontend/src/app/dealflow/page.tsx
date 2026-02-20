"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ArrowRight, ExternalLink, Globe, LayoutList, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { dealflowApi, type DealflowEntryCreateBody, type DealflowEntryUpdateBody } from "@/lib/api";
import type { DealflowEntry } from "@/types";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "none", label: "None" },
  { value: "reached_out", label: "Reached out" },
  { value: "in_diligence", label: "In diligence" },
  { value: "passed", label: "Passed" },
  { value: "invested", label: "Invested" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "murtaza", label: "Murtaza" },
  { value: "carter", label: "Carter" },
  { value: "friend", label: "Friend" },
  { value: "twitter", label: "Twitter" },
  { value: "newsletter", label: "Newsletter" },
  { value: "event", label: "Event" },
  { value: "other", label: "Other" },
];

const STAGE_OPTIONS = [
  { value: "", label: "All stages" },
  { value: "Pre-seed", label: "Pre-seed" },
  { value: "Seed", label: "Seed" },
  { value: "Series A", label: "Series A" },
  { value: "Series B", label: "Series B" },
  { value: "Other", label: "Other" },
];

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

export default function DealflowPage() {
  const { user, loading: authLoading } = useAuth();
  const [list, setList] = useState<DealflowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const router = useRouter();

  const [newName, setNewName] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newCompanyLinkedIn, setNewCompanyLinkedIn] = useState("");
  const [newOneLiner, setNewOneLiner] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newStage, setNewStage] = useState("");
  const [newAmountRaising, setNewAmountRaising] = useState("");
  const [newValuation, setNewValuation] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newSourceType, setNewSourceType] = useState("");
  const [newSourceDetail, setNewSourceDetail] = useState("");
  const [newStatus, setNewStatus] = useState("none");

  const load = useCallback(() => {
    setLoading(true);
    dealflowApi.entries
      .list({
        ...(search.trim() && { q: search.trim() }),
        ...(statusFilter && { status: statusFilter }),
        ...(sourceFilter && { source_type: sourceFilter }),
        ...(stageFilter && { stage: stageFilter }),
      })
      .then(setList)
      .catch(() => toast.error("Failed to load dealflow"))
      .finally(() => setLoading(false));
  }, [search, statusFilter, sourceFilter, stageFilter]);

  useEffect(() => {
    if (!authLoading && user) load();
    else if (!authLoading && !user) setLoading(false);
  }, [authLoading, user, load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const body: DealflowEntryCreateBody = {
        name: newName.trim(),
        status: newStatus || "none",
        ...(newWebsite.trim() && { website: newWebsite.trim() }),
        ...(newCompanyLinkedIn.trim() && { company_linkedin_url: newCompanyLinkedIn.trim() }),
        ...(newOneLiner.trim() && { one_liner: newOneLiner.trim() }),
        ...(newLocation.trim() && { location: newLocation.trim() }),
        ...(newStage && { stage: newStage }),
        ...(newAmountRaising.trim() && { amount_raising: parseFloat(newAmountRaising) || undefined }),
        ...(newValuation.trim() && { valuation: parseFloat(newValuation) || undefined }),
        ...(newNotes.trim() && { notes: newNotes.trim() }),
        ...(newSourceType && { source_type: newSourceType }),
        ...(newSourceDetail.trim() && { source_detail: newSourceDetail.trim() }),
      };
      await dealflowApi.entries.create(body);
      setNewName("");
      setNewWebsite("");
      setNewCompanyLinkedIn("");
      setNewOneLiner("");
      setNewLocation("");
      setNewStage("");
      setNewAmountRaising("");
      setNewValuation("");
      setNewNotes("");
      setNewSourceType("");
      setNewSourceDetail("");
      setNewStatus("none");
      setShowForm(false);
      load();
      toast.success("Company added to dealflow");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add company";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (entry: DealflowEntry) => {
    if (!confirm(`Delete "${entry.name}" from dealflow? This cannot be undone.`)) return;
    try {
      await dealflowApi.entries.delete(entry.id);
      toast.success(`"${entry.name}" removed`);
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handlePromoteToDealRoom = async (entry: DealflowEntry) => {
    if (entry.promoted_company_id) {
      router.push(`/companies/${entry.promoted_company_id}`);
      return;
    }
    setPromotingId(entry.id);
    try {
      const { company_id } = await dealflowApi.entries.promoteToDealRoom(entry.id, true);
      toast.success("Promoted to Deal Room");
      router.push(`/companies/${company_id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to promote";
      toast.error(message);
      setPromotingId(null);
    }
  };

  const handleInlineSave = async (
    entryId: string,
    field: string,
    value: string | number | null | undefined
  ) => {
    setEditing(null);
    const entry = list.find((e) => e.id === entryId);
    if (!entry) return;
    const payload: Record<string, unknown> = { [field]: value ?? null };
    if (field === "amount_raising" || field === "valuation") {
      payload[field] = value === "" || value === undefined ? undefined : Number(value);
    }
    setSaving(true);
    try {
      const updated = await dealflowApi.entries.update(entryId, payload as DealflowEntryUpdateBody);
      setList((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const isEditing = (id: string, field: string) => editing?.id === id && editing?.field === field;

  return (
    <div className="container mx-auto max-w-6xl px-6 pt-10 pb-20">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Dealflow</h1>
          <p className="text-muted-foreground mt-1">
            Top-of-funnel companies; promote winners to Deal Room.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 size-4" />
          Add company
        </Button>
      </div>

      {showForm && (
        <div className="mb-8 rounded-xl border bg-card p-4 shadow-sm space-y-4">
          <h3 className="font-medium">New dealflow entry</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Input
              placeholder="Company name *"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="sm:col-span-2"
            />
            <Input
              placeholder="Website"
              value={newWebsite}
              onChange={(e) => setNewWebsite(e.target.value)}
            />
            <Input
              placeholder="Company LinkedIn URL"
              value={newCompanyLinkedIn}
              onChange={(e) => setNewCompanyLinkedIn(e.target.value)}
              className="sm:col-span-2"
            />
            <Input
              placeholder="One-liner"
              value={newOneLiner}
              onChange={(e) => setNewOneLiner(e.target.value)}
              className="sm:col-span-2"
            />
            <Input
              placeholder="Location"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
            />
            <select
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {STAGE_OPTIONS.filter((o) => o.value).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Input
              placeholder="Amount raising ($)"
              value={newAmountRaising}
              onChange={(e) => setNewAmountRaising(e.target.value)}
              type="number"
            />
            <Input
              placeholder="Valuation ($)"
              value={newValuation}
              onChange={(e) => setNewValuation(e.target.value)}
              type="number"
            />
            <select
              value={newSourceType}
              onChange={(e) => setNewSourceType(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {SOURCE_OPTIONS.filter((o) => o.value).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Input
              placeholder="Source detail (e.g. Twitter @xyz)"
              value={newSourceDetail}
              onChange={(e) => setNewSourceDetail(e.target.value)}
              className="sm:col-span-2"
            />
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div className="sm:col-span-2">
              <Input
                placeholder="Notes"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={creating || !newName.trim()} size="sm">
              {creating ? "Adding…" : "Add"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {saving && (
        <p className="text-muted-foreground text-sm mb-2">Saving…</p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search all columns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {STAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border bg-card" />
          ))}
        </div>
      )}

      {!loading && list.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-20">
          <LayoutList className="text-muted-foreground mb-4 size-12" />
          <p className="text-muted-foreground text-lg">No dealflow entries yet.</p>
          <p className="text-muted-foreground text-sm">Click &quot;Add company&quot; to get started.</p>
        </div>
      )}

      {!loading && list.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">One-liner</th>
                <th className="text-left p-3 font-medium">Stage</th>
                <th className="text-right p-3 font-medium">Amount</th>
                <th className="text-right p-3 font-medium">Valuation</th>
                <th className="text-left p-3 font-medium">Location</th>
                <th className="text-left p-3 font-medium">Source</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Created</th>
                <th className="w-10 p-3" />
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      {isEditing(e.id, "name") ? (
                        <Input
                          className="h-8 w-full min-w-[120px]"
                          defaultValue={e.name}
                          autoFocus
                          onBlur={(ev) => handleInlineSave(e.id, "name", ev.target.value.trim() || e.name)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") {
                              ev.currentTarget.blur();
                            }
                            if (ev.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <span
                          role="button"
                          tabIndex={0}
                          className="font-medium text-foreground cursor-text hover:bg-muted/50 rounded px-1 -mx-1"
                          onClick={() => setEditing({ id: e.id, field: "name" })}
                          onKeyDown={(ev) => ev.key === "Enter" && setEditing({ id: e.id, field: "name" })}
                        >
                          {e.name}
                        </span>
                      )}
                      <Link
                        href={`/dealflow/${e.id}`}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Open full entry"
                      >
                        <ExternalLink className="size-3.5" />
                      </Link>
                      {e.promoted_company_id && (
                        <Link
                          href={`/companies/${e.promoted_company_id}`}
                          className="rounded bg-green-500/15 px-1.5 py-0.5 text-xs text-green-700 dark:text-green-400 hover:underline shrink-0"
                        >
                          In Deal Room
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="p-2 max-w-[200px]">
                    {isEditing(e.id, "one_liner") ? (
                      <Input
                        className="h-8 w-full text-sm"
                        defaultValue={e.one_liner ?? ""}
                        autoFocus
                        placeholder="One-liner"
                        onBlur={(ev) => handleInlineSave(e.id, "one_liner", ev.target.value.trim() || undefined)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") ev.currentTarget.blur();
                          if (ev.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="text-muted-foreground text-sm block truncate cursor-text hover:bg-muted/50 rounded px-1 -mx-1"
                        onClick={() => setEditing({ id: e.id, field: "one_liner" })}
                        onKeyDown={(ev) => ev.key === "Enter" && setEditing({ id: e.id, field: "one_liner" })}
                        title={e.one_liner ?? undefined}
                      >
                        {e.one_liner || "—"}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {isEditing(e.id, "stage") ? (
                      <select
                        className="h-8 w-full min-w-[100px] rounded-md border bg-background px-2 text-sm"
                        defaultValue={e.stage ?? ""}
                        autoFocus
                        onBlur={(ev) => handleInlineSave(e.id, "stage", ev.target.value || undefined)}
                        onKeyDown={(ev) => ev.key === "Escape" && setEditing(null)}
                      >
                        {STAGE_OPTIONS.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="block cursor-text hover:bg-muted/50 rounded px-1 -mx-1"
                        onClick={() => setEditing({ id: e.id, field: "stage" })}
                        onKeyDown={(ev) => ev.key === "Enter" && setEditing({ id: e.id, field: "stage" })}
                      >
                        {e.stage || "—"}
                      </span>
                    )}
                  </td>
                  <td className="text-right p-2">
                    {isEditing(e.id, "amount_raising") ? (
                      <Input
                        type="number"
                        className="h-8 w-24 text-right text-sm ml-auto"
                        defaultValue={e.amount_raising ?? ""}
                        autoFocus
                        placeholder="—"
                        onBlur={(ev) =>
                          handleInlineSave(
                            e.id,
                            "amount_raising",
                            ev.target.value === "" ? undefined : parseFloat(ev.target.value)
                          )
                        }
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") ev.currentTarget.blur();
                          if (ev.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="cursor-text hover:bg-muted/50 rounded px-1 -mx-1 block"
                        onClick={() => setEditing({ id: e.id, field: "amount_raising" })}
                        onKeyDown={(ev) => ev.key === "Enter" && setEditing({ id: e.id, field: "amount_raising" })}
                      >
                        {formatCurrency(e.amount_raising)}
                      </span>
                    )}
                  </td>
                  <td className="text-right p-2">
                    {isEditing(e.id, "valuation") ? (
                      <Input
                        type="number"
                        className="h-8 w-24 text-right text-sm ml-auto"
                        defaultValue={e.valuation ?? ""}
                        autoFocus
                        placeholder="—"
                        onBlur={(ev) =>
                          handleInlineSave(
                            e.id,
                            "valuation",
                            ev.target.value === "" ? undefined : parseFloat(ev.target.value)
                          )
                        }
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") ev.currentTarget.blur();
                          if (ev.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="cursor-text hover:bg-muted/50 rounded px-1 -mx-1 block"
                        onClick={() => setEditing({ id: e.id, field: "valuation" })}
                        onKeyDown={(ev) => ev.key === "Enter" && setEditing({ id: e.id, field: "valuation" })}
                      >
                        {formatCurrency(e.valuation)}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {isEditing(e.id, "location") ? (
                      <Input
                        className="h-8 w-full min-w-[80px] text-sm"
                        defaultValue={e.location ?? ""}
                        autoFocus
                        placeholder="—"
                        onBlur={(ev) => handleInlineSave(e.id, "location", ev.target.value.trim() || undefined)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") ev.currentTarget.blur();
                          if (ev.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="text-muted-foreground block cursor-text hover:bg-muted/50 rounded px-1 -mx-1 truncate"
                        onClick={() => setEditing({ id: e.id, field: "location" })}
                        onKeyDown={(ev) => ev.key === "Enter" && setEditing({ id: e.id, field: "location" })}
                      >
                        {e.location || "—"}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {isEditing(e.id, "source_type") ? (
                      <select
                        className="h-8 w-full min-w-[90px] rounded-md border bg-background px-2 text-sm"
                        defaultValue={e.source_type ?? ""}
                        autoFocus
                        onBlur={(ev) => handleInlineSave(e.id, "source_type", ev.target.value || undefined)}
                        onKeyDown={(ev) => ev.key === "Escape" && setEditing(null)}
                      >
                        {SOURCE_OPTIONS.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="block cursor-text hover:bg-muted/50 rounded px-1 -mx-1"
                        onClick={() => setEditing({ id: e.id, field: "source_type" })}
                        onKeyDown={(ev) => ev.key === "Enter" && setEditing({ id: e.id, field: "source_type" })}
                      >
                        {e.source_type || "—"}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {isEditing(e.id, "status") ? (
                      <select
                        className="h-8 w-full min-w-[100px] rounded-md border bg-background px-2 text-sm"
                        defaultValue={e.status}
                        autoFocus
                        onBlur={(ev) => handleInlineSave(e.id, "status", ev.target.value)}
                        onKeyDown={(ev) => ev.key === "Escape" && setEditing(null)}
                      >
                        {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="rounded bg-muted px-1.5 py-0.5 text-xs cursor-text hover:ring-1 hover:ring-muted-foreground/30"
                        onClick={() => setEditing({ id: e.id, field: "status" })}
                        onKeyDown={(ev) => ev.key === "Enter" && setEditing({ id: e.id, field: "status" })}
                      >
                        {e.status}
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground p-3 text-sm">
                    {new Date(e.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center justify-end gap-0.5">
                      {e.website && (
                        <a
                          href={e.website.startsWith("http") ? e.website : `https://${e.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title={`Open ${e.website}`}
                        >
                          <Globe className="size-4" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handlePromoteToDealRoom(e)}
                        disabled={promotingId === e.id}
                        className="rounded p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
                        title={e.promoted_company_id ? "Open in Deal Room" : "Promote to Deal Room & open"}
                      >
                        {promotingId === e.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ArrowRight className="size-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(e)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
