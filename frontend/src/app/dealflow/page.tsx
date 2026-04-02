"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Globe, LayoutList, Linkedin, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { CompanyLogo } from "@/components/company-logo";
import { LocationPicker } from "@/components/location-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { dealflowApi, locationsApi, trackedPersonsApi, type DealflowEntryCreateBody, type LocationItem, type TrackedPersonCreateBody } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DealflowEntry, TrackedPerson } from "@/types";

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayStatus(status: string): string {
  if (status === "none") return "Lead";
  if (status === "active") return "Active Deal";
  return titleCase(status.replace(/_/g, " "));
}

function statusKey(status: string): string {
  return status === "none" ? "lead" : status;
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "lead", label: "Lead" },
  { value: "tracking", label: "Tracking" },
  { value: "active", label: "Active Deal" },
  { value: "reached_out", label: "Reached out" },
  { value: "passed", label: "Passed" },
  { value: "invested", label: "Invested" },
];

const STATUS_COLORS: Record<string, string> = {
  lead: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
  tracking: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  active: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400",
  reached_out: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  passed: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  invested: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "venture_partner", label: "Venture Partner" },
  { value: "investor_intro", label: "Investor Intro" },
  { value: "lp_intro", label: "LP Intro" },
  { value: "self_sourced", label: "Self Sourced" },
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

type SubTab = "companies" | "people";

export default function DealflowPage() {
  const { user, loading: authLoading } = useAuth();
  const [subTab, setSubTab] = useState<SubTab>("companies");

  // Companies state
  const [list, setList] = useState<DealflowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  // People tracker state
  const [people, setPeople] = useState<TrackedPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [peopleSourceFilter, setPeopleSourceFilter] = useState("");
  const [showPersonForm, setShowPersonForm] = useState(false);
  const [creatingPerson, setCreatingPerson] = useState(false);
  const [editingPerson, setEditingPerson] = useState<{ id: string; field: string } | null>(null);
  const [savingPerson, setSavingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonLinkedIn, setNewPersonLinkedIn] = useState("");
  const [newPersonNotes, setNewPersonNotes] = useState("");
  const [newPersonSource, setNewPersonSource] = useState("");

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
  const [newStatus, setNewStatus] = useState("lead");

  const [importNotesText, setImportNotesText] = useState("");
  const [importNotesUrl, setImportNotesUrl] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    dealflowApi.entries
      .list({
        ...(search.trim() && { q: search.trim() }),
        ...(statusFilter && { status: statusFilter }),
        ...(sourceFilter && { source_type: sourceFilter }),
        ...(stageFilter && { stage: stageFilter }),
        ...(locationFilter && { location: locationFilter }),
      })
      .then(setList)
      .catch(() => toast.error("Failed to load dealflow"))
      .finally(() => setLoading(false));
  }, [search, statusFilter, sourceFilter, stageFilter, locationFilter]);

  useEffect(() => {
    if (!authLoading && user) {
      load();
      locationsApi.list().then(setLocations).catch(() => {});
    } else if (!authLoading && !user) setLoading(false);
  }, [authLoading, user, load]);

  const loadPeople = useCallback(() => {
    setPeopleLoading(true);
    trackedPersonsApi
      .list({
        ...(peopleSearch.trim() && { q: peopleSearch.trim() }),
        ...(peopleSourceFilter && { source: peopleSourceFilter }),
      })
      .then(setPeople)
      .catch(() => toast.error("Failed to load people"))
      .finally(() => setPeopleLoading(false));
  }, [peopleSearch, peopleSourceFilter]);

  useEffect(() => {
    if (!authLoading && user && subTab === "people") loadPeople();
  }, [authLoading, user, subTab, loadPeople]);

  const handleCreatePerson = async () => {
    if (!newPersonName.trim()) return;
    setCreatingPerson(true);
    try {
      const body: TrackedPersonCreateBody = {
        name: newPersonName.trim(),
        ...(newPersonLinkedIn.trim() && { linkedin_url: newPersonLinkedIn.trim() }),
        ...(newPersonNotes.trim() && { notes: newPersonNotes.trim() }),
        ...(newPersonSource && { source: newPersonSource }),
      };
      const created = await trackedPersonsApi.create(body);
      setPeople((prev) => [created, ...prev]);
      setNewPersonName("");
      setNewPersonLinkedIn("");
      setNewPersonNotes("");
      setNewPersonSource("");
      setShowPersonForm(false);
      toast.success("Person added");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add person";
      toast.error(message);
    } finally {
      setCreatingPerson(false);
    }
  };

  const handleDeletePerson = async (p: TrackedPerson) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await trackedPersonsApi.delete(p.id);
      setPeople((prev) => prev.filter((x) => x.id !== p.id));
      toast.success(`"${p.name}" removed`);
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handlePromoteToContact = async (p: TrackedPerson) => {
    try {
      const res = await trackedPersonsApi.promoteToContact(p.id);
      toast.success(res.message);
      router.push(`/network`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to promote";
      toast.error(message);
    }
  };

  const handlePersonInlineSave = async (
    personId: string,
    field: string,
    value: string | null | undefined
  ) => {
    setEditingPerson(null);
    setSavingPerson(true);
    try {
      const updated = await trackedPersonsApi.update(personId, { [field]: value ?? null });
      setPeople((prev) => prev.map((p) => (p.id === personId ? updated : p)));
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingPerson(false);
    }
  };

  const isEditingPerson = (id: string, field: string) =>
    editingPerson?.id === id && editingPerson?.field === field;

  const handleCreate = async () => {
    const hasNotes = importNotesText.trim() || importNotesUrl.trim();
    if (!hasNotes && !newName.trim()) return;
    setCreating(true);
    try {
      let created;
      if (hasNotes) {
        created = await dealflowApi.entries.createFromNotes({
          ...(importNotesText.trim() && { text: importNotesText.trim() }),
          ...(importNotesUrl.trim() && { url: importNotesUrl.trim() }),
        });
      } else {
        const body: DealflowEntryCreateBody = {
          name: newName.trim(),
          status: newStatus || "lead",
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
        created = await dealflowApi.entries.create(body);
      }
      setList((prev) => [created, ...prev]);
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
      setNewStatus("lead");
      setImportNotesText("");
      setImportNotesUrl("");
      setShowForm(false);
      toast.success(hasNotes ? `"${created.name}" added from notes` : "Company added to dealflow");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add company";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] px-4 sm:px-6 pt-10 pb-20">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Dealflow</h1>
          <p className="text-muted-foreground mt-1">
            Top-of-funnel companies and people you&apos;re tracking.
          </p>
        </div>
        {subTab === "companies" ? (
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            <Plus className="mr-1.5 size-4" />
            Add company
          </Button>
        ) : (
          <Button onClick={() => setShowPersonForm(!showPersonForm)} size="sm">
            <Plus className="mr-1.5 size-4" />
            Add person
          </Button>
        )}
      </div>

      {/* Sub-tab toggle */}
      <div className="mb-6 flex gap-1 rounded-lg border bg-muted p-1 w-fit">
        <button
          type="button"
          onClick={() => setSubTab("companies")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            subTab === "companies"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Companies
        </button>
        <button
          type="button"
          onClick={() => setSubTab("people")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            subTab === "people"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          People
        </button>
      </div>

      {subTab === "companies" && showForm && (
        <div className="mb-8 rounded-xl border bg-card p-4 shadow-sm space-y-4">
          <h3 className="font-medium">New dealflow entry</h3>
          <div className="space-y-1">
            <label htmlFor="import-notes-textarea" className="text-muted-foreground text-xs font-medium">Paste call/meeting notes (optional)</label>
            <textarea
              id="import-notes-textarea"
              placeholder="Paste your Granola or meeting notes here and we'll auto-extract the company info…"
              value={importNotesText}
              onChange={(e) => setImportNotesText(e.target.value)}
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
            <Input
              placeholder="Or paste a Granola link (optional)"
              value={importNotesUrl}
              onChange={(e) => setImportNotesUrl(e.target.value)}
            />
          </div>
          {(importNotesText.trim() || importNotesUrl.trim()) && (
            <p className="text-xs text-primary">Notes detected — fields below will be auto-populated on submit.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Input
              placeholder={importNotesText.trim() || importNotesUrl.trim() ? "Company name (auto-filled from notes)" : "Company name *"}
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
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs font-medium">Location</span>
              <LocationPicker
                variant="field"
                locations={locations}
                value={newLocation}
                onChange={setNewLocation}
                onAdd={async (name) => {
                  const loc = await locationsApi.create(name);
                  setLocations((prev) => [...prev, loc].sort((a, b) => a.name.localeCompare(b.name)));
                  setNewLocation(loc.name);
                }}
                className="max-w-none [&_button]:max-w-none"
              />
            </div>
            <select
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="" disabled>Stage…</option>
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
              <option value="" disabled>Source…</option>
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
            <Button
              onClick={handleCreate}
              disabled={creating || (!newName.trim() && !importNotesText.trim() && !importNotesUrl.trim())}
              size="sm"
            >
              {creating ? (importNotesText.trim() || importNotesUrl.trim() ? "Extracting…" : "Adding…") : "Add"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {subTab === "companies" && (<>
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
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground text-xs font-medium whitespace-nowrap">Location</span>
          <LocationPicker
            variant="filter"
            locations={locations}
            value={locationFilter}
            onChange={setLocationFilter}
            onAdd={async (name) => {
              const loc = await locationsApi.create(name);
              setLocations((prev) => [...prev, loc].sort((a, b) => a.name.localeCompare(b.name)));
              setLocationFilter(loc.name);
            }}
          />
        </div>
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
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[22%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[90px]" />
            </colgroup>
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2.5 font-medium">Name</th>
                <th className="text-left p-2.5 font-medium">One-liner</th>
                <th className="text-left p-2.5 font-medium">Stage</th>
                <th className="text-right p-2.5 font-medium">Amount</th>
                <th className="text-right p-2.5 font-medium">Valuation</th>
                <th className="text-left p-2.5 font-medium">Location</th>
                <th className="text-left p-2.5 font-medium">Source</th>
                <th className="text-left p-2.5 font-medium">Status</th>
                <th className="text-left p-2.5 font-medium">Created</th>
                <th className="sticky right-0 z-20 border-l border-border/70 bg-muted/95 p-2.5 text-right font-medium shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.12)] backdrop-blur-sm dark:shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.35)]">
                  Edit
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="group border-b last:border-0 hover:bg-muted/30">
                  <td className="p-2 min-w-0 overflow-hidden">
                    <div className="flex min-w-0 items-center gap-2">
                      <CompanyLogo name={e.name} logoUrl={e.logo_url} size="sm" />
                      <Link
                        href={e.promoted_company_id ? `/dealroom/${e.promoted_company_id}` : `/dealflow/${e.id}`}
                        className="min-w-0 truncate font-medium text-foreground hover:underline"
                        title={e.name}
                      >
                        {e.name}
                      </Link>
                      {e.website && (
                        <a
                          href={e.website.startsWith("http") ? e.website : `https://${e.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title={e.website}
                        >
                          <Globe className="size-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="p-2 min-w-0">
                    <span className="text-muted-foreground text-sm block truncate" title={e.one_liner ?? undefined}>
                      {e.one_liner || "—"}
                    </span>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {e.stage ? titleCase(e.stage) : "—"}
                  </td>
                  <td className="text-right p-2">
                    {formatCurrency(e.amount_raising)}
                  </td>
                  <td className="text-right p-2">
                    {formatCurrency(e.valuation)}
                  </td>
                  <td className="p-2">
                    <span className="text-muted-foreground block truncate">
                      {e.location || "—"}
                    </span>
                  </td>
                  <td className="p-2">
                    {e.source_type ? titleCase(e.source_type) : "—"}
                  </td>
                  <td className="p-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs whitespace-nowrap",
                        STATUS_COLORS[statusKey(e.status)] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {displayStatus(e.status)}
                    </span>
                  </td>
                  <td className="text-muted-foreground p-2 text-sm whitespace-nowrap">
                    {new Date(e.created_at).toLocaleDateString()}
                  </td>
                  <td className="sticky right-0 z-10 border-l border-border/70 bg-card p-2 text-right whitespace-nowrap shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.08)] transition-colors group-hover:bg-muted/30 dark:bg-card dark:shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.3)] dark:group-hover:bg-muted/30">
                    <Link
                      href={`/dealflow/${e.id}?edit=1`}
                      className="inline-flex rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      </>)}

      {/* ── People Tracker ──────────────────────────────────────── */}
      {subTab === "people" && (<>
      {showPersonForm && (
        <div className="mb-8 rounded-xl border bg-card p-4 shadow-sm space-y-4">
          <h3 className="font-medium">Add a person</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Input
              placeholder="Name *"
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
              className="sm:col-span-2"
            />
            <Input
              placeholder="LinkedIn URL"
              value={newPersonLinkedIn}
              onChange={(e) => setNewPersonLinkedIn(e.target.value)}
            />
            <select
              value={newPersonSource}
              onChange={(e) => setNewPersonSource(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Source…</option>
              {SOURCE_OPTIONS.filter((o) => o.value).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div className="sm:col-span-2">
              <Input
                placeholder="Notes"
                value={newPersonNotes}
                onChange={(e) => setNewPersonNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreatePerson} disabled={creatingPerson || !newPersonName.trim()} size="sm">
              {creatingPerson ? "Adding…" : "Add"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPersonForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {savingPerson && (
        <p className="text-muted-foreground text-sm mb-2">Saving…</p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search people…"
            value={peopleSearch}
            onChange={(e) => setPeopleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={peopleSourceFilter}
          onChange={(e) => setPeopleSourceFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {peopleLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border bg-card" />
          ))}
        </div>
      )}

      {!peopleLoading && people.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-20">
          <LayoutList className="text-muted-foreground mb-4 size-12" />
          <p className="text-muted-foreground text-lg">No tracked people yet.</p>
          <p className="text-muted-foreground text-sm">Click &quot;Add person&quot; to start tracking someone.</p>
        </div>
      )}

      {!peopleLoading && people.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Person</th>
                <th className="text-left p-3 font-medium">LinkedIn</th>
                <th className="text-left p-3 font-medium">Notes</th>
                <th className="text-left p-3 font-medium">Source</th>
                <th className="text-left p-3 font-medium">Linked Company</th>
                <th className="text-left p-3 font-medium">Added</th>
                <th className="w-10 p-3" />
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-2">
                    {isEditingPerson(p.id, "name") ? (
                      <Input
                        className="h-8 w-full min-w-[120px]"
                        defaultValue={p.name}
                        onBlur={(ev) => handlePersonInlineSave(p.id, "name", ev.target.value.trim() || p.name)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") ev.currentTarget.blur();
                          if (ev.key === "Escape") setEditingPerson(null);
                        }}
                      />
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="font-medium text-foreground cursor-text hover:bg-muted/50 rounded px-1 -mx-1"
                        onClick={() => setEditingPerson({ id: p.id, field: "name" })}
                        onKeyDown={(ev) => ev.key === "Enter" && setEditingPerson({ id: p.id, field: "name" })}
                      >
                        {p.name}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {isEditingPerson(p.id, "linkedin_url") ? (
                      <Input
                        className="h-8 w-full min-w-[160px] text-sm"
                        defaultValue={p.linkedin_url ?? ""}
                        placeholder="LinkedIn URL"
                        onBlur={(ev) => handlePersonInlineSave(p.id, "linkedin_url", ev.target.value.trim() || undefined)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") ev.currentTarget.blur();
                          if (ev.key === "Escape") setEditingPerson(null);
                        }}
                      />
                    ) : p.linkedin_url ? (
                      <div className="flex items-center gap-1.5">
                        <a
                          href={p.linkedin_url.startsWith("http") ? p.linkedin_url : `https://${p.linkedin_url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title="Open LinkedIn"
                        >
                          <Linkedin className="size-4" />
                        </a>
                        <span
                          role="button"
                          tabIndex={0}
                          className="text-muted-foreground text-xs truncate max-w-[120px] cursor-text hover:bg-muted/50 rounded px-1"
                          onClick={() => setEditingPerson({ id: p.id, field: "linkedin_url" })}
                          onKeyDown={(ev) => ev.key === "Enter" && setEditingPerson({ id: p.id, field: "linkedin_url" })}
                        >
                          {p.linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "").replace(/\/$/, "")}
                        </span>
                      </div>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="text-muted-foreground cursor-text hover:bg-muted/50 rounded px-1 -mx-1"
                        onClick={() => setEditingPerson({ id: p.id, field: "linkedin_url" })}
                        onKeyDown={(ev) => ev.key === "Enter" && setEditingPerson({ id: p.id, field: "linkedin_url" })}
                      >
                        —
                      </span>
                    )}
                  </td>
                  <td className="p-2 max-w-[200px]">
                    {isEditingPerson(p.id, "notes") ? (
                      <Input
                        className="h-8 w-full text-sm"
                        defaultValue={p.notes ?? ""}
                        placeholder="Notes"
                        onBlur={(ev) => handlePersonInlineSave(p.id, "notes", ev.target.value.trim() || undefined)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") ev.currentTarget.blur();
                          if (ev.key === "Escape") setEditingPerson(null);
                        }}
                      />
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="text-muted-foreground text-sm block truncate cursor-text hover:bg-muted/50 rounded px-1 -mx-1"
                        onClick={() => setEditingPerson({ id: p.id, field: "notes" })}
                        onKeyDown={(ev) => ev.key === "Enter" && setEditingPerson({ id: p.id, field: "notes" })}
                        title={p.notes ?? undefined}
                      >
                        {p.notes || "—"}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {isEditingPerson(p.id, "source") ? (
                      <select
                        className="h-8 w-full min-w-[90px] rounded-md border bg-background px-2 text-sm"
                        defaultValue={p.source ?? ""}
                        onBlur={(ev) => handlePersonInlineSave(p.id, "source", ev.target.value || undefined)}
                        onKeyDown={(ev) => ev.key === "Escape" && setEditingPerson(null)}
                      >
                        <option value="">—</option>
                        {SOURCE_OPTIONS.filter((o) => o.value).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        className="block cursor-text hover:bg-muted/50 rounded px-1 -mx-1"
                        onClick={() => setEditingPerson({ id: p.id, field: "source" })}
                        onKeyDown={(ev) => ev.key === "Enter" && setEditingPerson({ id: p.id, field: "source" })}
                      >
                        {p.source || "—"}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {p.dealflow_entry_name ? (
                      <Link
                        href={`/dealflow/${p.dealflow_entry_id}`}
                        className="text-primary text-sm hover:underline"
                      >
                        {p.dealflow_entry_name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="text-muted-foreground p-3 text-sm">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => handlePromoteToContact(p)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                        title="Promote to Network Contact"
                      >
                        <UserPlus className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePerson(p)}
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
      </>)}
    </div>
  );
}
