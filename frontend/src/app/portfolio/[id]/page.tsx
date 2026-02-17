"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  FileText,
  Loader2,
  Clock,
  MessageSquare,
  Mail,
  LinkIcon,
  Phone,
  Sparkles,
  TrendingUp,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { portfolioApi, memos as memosApi } from "@/lib/api";
import type { PortfolioSnapshot, PortfolioUpdateEntry, Memo, SimulationRun } from "@/types";

function fmt$(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

const SOURCE_OPTIONS = [
  { value: "paste", label: "Paste / Notes", icon: MessageSquare },
  { value: "email", label: "Email", icon: Mail },
  { value: "call", label: "Call Notes", icon: Phone },
  { value: "link", label: "Link / URL", icon: LinkIcon },
];

const SECTOR_OPTIONS = [
  { value: "", label: "—" },
  { value: "ai", label: "AI" },
  { value: "fintech", label: "FinTech" },
  { value: "healthcare", label: "Healthcare" },
  { value: "consumer", label: "Consumer" },
  { value: "saas", label: "SaaS" },
  { value: "other", label: "Other" },
];
const GEO_OPTIONS = [
  { value: "", label: "—" },
  { value: "california", label: "California" },
  { value: "new_york", label: "New York" },
  { value: "massachusetts", label: "Massachusetts" },
  { value: "other_us", label: "Other US" },
  { value: "international", label: "International" },
];
const FOUNDER_OPTIONS = [
  { value: "", label: "—" },
  { value: "first_time", label: "First-time" },
  { value: "repeat", label: "Repeat" },
];

export default function PortfolioDetailPage() {
  const params = useParams();
  const router = useRouter();
  const entryId = params.id as string;

  const [entry, setEntry] = useState<PortfolioSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  // Updates / notes
  const [updates, setUpdates] = useState<PortfolioUpdateEntry[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(true);
  const [showAddUpdate, setShowAddUpdate] = useState(false);
  const [updateContent, setUpdateContent] = useState("");
  const [updateSource, setUpdateSource] = useState("paste");
  const [submitting, setSubmitting] = useState(false);

  // Memo
  const [memo, setMemo] = useState<Memo | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);

  // Simulation
  const [lastSim, setLastSim] = useState<SimulationRun | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [runningNewSim, setRunningNewSim] = useState(false);

  const loadEntry = useCallback(() => {
    portfolioApi
      .get(entryId)
      .then(setEntry)
      .catch(() => router.push("/portfolio"));
  }, [entryId, router]);

  const loadUpdates = useCallback(() => {
    setUpdatesLoading(true);
    portfolioApi
      .listUpdates(entryId)
      .then(setUpdates)
      .catch(() => {})
      .finally(() => setUpdatesLoading(false));
  }, [entryId]);

  const loadMemo = useCallback(
    (companyId: string) => {
      setMemoLoading(true);
      memosApi
        .get(companyId)
        .then(setMemo)
        .catch(() => setMemo(null))
        .finally(() => setMemoLoading(false));
    },
    [],
  );

  const loadLastSim = useCallback(() => {
    setSimLoading(true);
    portfolioApi
      .listSims(entryId)
      .then((sims) => setLastSim(sims.length > 0 ? sims[0] : null))
      .catch(() => {})
      .finally(() => setSimLoading(false));
  }, [entryId]);

  useEffect(() => {
    setLoading(true);
    portfolioApi
      .get(entryId)
      .then((e) => {
        setEntry(e);
        if (e.company_id) {
          loadMemo(e.company_id);
        }
      })
      .catch(() => router.push("/portfolio"))
      .finally(() => setLoading(false));
    loadUpdates();
    loadLastSim();
  }, [entryId, router, loadUpdates, loadMemo, loadLastSim]);

  const handleAddUpdate = async () => {
    if (!updateContent.trim()) return;
    setSubmitting(true);
    try {
      await portfolioApi.addUpdate(entryId, updateContent.trim(), updateSource);
      setUpdateContent("");
      setShowAddUpdate(false);
      loadUpdates();
      toast.success("Update added & indexed for AI context");
    } catch {
      toast.error("Failed to add update");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunSim = async () => {
    if (!entry?.entry_valuation || !entry.investment_size) return;
    setRunningNewSim(true);
    try {
      const res = await portfolioApi.runSim(entryId);
      setLastSim(res);
      toast.success("Simulation complete — AI used latest context");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setRunningNewSim(false);
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl px-6 pt-10 pb-20">
        <div className="mb-6 h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="mb-2 h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!entry) return null;

  const mc = lastSim?.outputs?.monte_carlo;

  return (
    <div className="container mx-auto max-w-5xl px-6 pt-10 pb-20">
      {/* Back link */}
      <Link
        href="/portfolio"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        All Portfolio
      </Link>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {entry.company_name}
          </h1>
          {entry.one_liner && (
            <p className="text-muted-foreground mt-1">{entry.one_liner}</p>
          )}
          <div className="text-muted-foreground mt-2 flex flex-wrap gap-4 text-sm">
            {entry.investment_stage && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                {entry.investment_stage}
              </span>
            )}
            <span>Check: {fmt$(entry.investment_size)}</span>
            <span>Entry: {fmt$(entry.entry_valuation)}</span>
            {entry.ownership_pct != null && (
              <span>Own: {entry.ownership_pct.toFixed(2)}%</span>
            )}
            {entry.investment_date && <span>Date: {entry.investment_date}</span>}
          </div>
        </div>
        {entry.company_id && (
          <Link href={`/companies/${entry.company_id}`}>
            <Button variant="outline" size="sm">
              <FileText className="mr-1.5 size-4" />
              View Diligence
            </Button>
          </Link>
        )}
      </div>

      {/* Grid: Left = memo + sim, Right = updates */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN: Memo + Simulation */}
        <div className="space-y-6 lg:col-span-1">
          {/* Memo card */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-display mb-3 text-sm font-semibold">
              Investment Memo
            </h3>
            {memoLoading ? (
              <div className="h-8 animate-pulse rounded bg-muted" />
            ) : memo ? (
              <div>
                <p className="text-muted-foreground text-sm">
                  v{memo.version} &middot;{" "}
                  {new Date(memo.created_at).toLocaleDateString()}
                </p>
                <p className="mt-1 line-clamp-3 text-sm">
                  {memo.sections?.[0]?.content?.slice(0, 200)}…
                </p>
                <Link
                  href={`/companies/${entry.company_id}`}
                  className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Read full memo →
                </Link>
              </div>
            ) : entry.company_id ? (
              <p className="text-muted-foreground text-sm">
                No memo generated yet.{" "}
                <Link
                  href={`/companies/${entry.company_id}`}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  Generate one →
                </Link>
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Not linked to a diligence company.
              </p>
            )}
          </div>

          {/* Factor metadata + standalone outlier probability */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-display mb-3 text-sm font-semibold">
              Factor metadata
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-muted-foreground mb-1 block text-xs">
                  Sector
                </label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={entry.sector ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setEntry((prev) => (prev ? { ...prev, sector: v } : null));
                    portfolioApi
                      .update(entryId, { sector: v })
                      .then(setEntry)
                      .catch(() => toast.error("Failed to update"));
                  }}
                >
                  {SECTOR_OPTIONS.map((o) => (
                    <option key={o.value || "x"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-muted-foreground mb-1 block text-xs">
                  Geography
                </label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={entry.geography ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setEntry((prev) => (prev ? { ...prev, geography: v } : null));
                    portfolioApi
                      .update(entryId, { geography: v })
                      .then(setEntry)
                      .catch(() => toast.error("Failed to update"));
                  }}
                >
                  {GEO_OPTIONS.map((o) => (
                    <option key={o.value || "x"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-muted-foreground mb-1 block text-xs">
                  Founder type
                </label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={entry.founder_type ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setEntry((prev) => (prev ? { ...prev, founder_type: v } : null));
                    portfolioApi
                      .update(entryId, { founder_type: v })
                      .then(setEntry)
                      .catch(() => toast.error("Failed to update"));
                  }}
                >
                  {FOUNDER_OPTIONS.map((o) => (
                    <option key={o.value || "x"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-muted-foreground text-xs">
                  Standalone outlier probability
                </p>
                <p className="text-lg font-semibold">
                  {entry.effective_outlier_probability != null
                    ? `${(entry.effective_outlier_probability * 100).toFixed(2)}%`
                    : "—"}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {entry.outlier_probability != null
                    ? "Override set"
                    : "Derived from sector / geography / founder"}
                </p>
              </div>
            </div>
          </div>

          {/* Simulation / Outlier card (per-company exit multiple sim) */}
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">
                Exit multiple simulation
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunSim}
                disabled={
                  runningNewSim ||
                  !entry.entry_valuation ||
                  !entry.investment_size
                }
              >
                {runningNewSim ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 size-3.5" />
                )}
                {runningNewSim ? "Running…" : "AI Simulate"}
              </Button>
            </div>

            {simLoading ? (
              <div className="space-y-2">
                <div className="h-12 animate-pulse rounded bg-muted" />
                <div className="h-8 animate-pulse rounded bg-muted" />
              </div>
            ) : mc ? (
              <div>
                {/* Outlier metrics */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/50 px-2 py-3">
                    <p className="text-xs text-muted-foreground">P(5x)</p>
                    <p className="text-lg font-bold text-green-600">
                      {fmtPct(mc.prob_5x * 100)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2 py-3">
                    <p className="text-xs text-muted-foreground">P(10x)</p>
                    <p className="text-lg font-bold text-green-600">
                      {fmtPct(mc.prob_10x * 100)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2 py-3">
                    <p className="text-xs text-muted-foreground">Mean MOIC</p>
                    <p className="text-lg font-bold">
                      {mc.mean_moic.toFixed(1)}x
                    </p>
                  </div>
                </div>

                <div className="text-muted-foreground mt-3 text-xs">
                  <Clock className="mr-1 inline size-3" />
                  Last run:{" "}
                  {new Date(lastSim!.created_at).toLocaleString()}
                </div>
                {entry.company_id && (
                  <Link
                    href={`/companies/${entry.company_id}`}
                    className="mt-1 inline-block text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    View full simulation →
                  </Link>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center py-6 text-center">
                <TrendingUp className="text-muted-foreground mb-2 size-8" />
                <p className="text-muted-foreground text-sm">
                  No simulation yet.
                </p>
                {(!entry.entry_valuation || !entry.investment_size) ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Entry valuation and check size required to run.
                  </p>
                ) : (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Click &quot;AI Simulate&quot; to generate outlier probabilities.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Updates / Notes (audit trail) */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border bg-card">
            {/* Updates header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="font-display text-sm font-semibold">
                Updates & Notes
                {updates.length > 0 && (
                  <span className="text-muted-foreground ml-2 font-normal">
                    ({updates.length})
                  </span>
                )}
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddUpdate(!showAddUpdate)}
              >
                <Plus className="mr-1.5 size-4" />
                Drop an Update
              </Button>
            </div>

            {/* Add update form */}
            {showAddUpdate && (
              <div className="border-b p-5">
                <div className="mb-3 flex flex-wrap gap-2">
                  {SOURCE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setUpdateSource(opt.value)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        updateSource === opt.value
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:border-foreground/50"
                      }`}
                    >
                      <opt.icon className="size-3" />
                      {opt.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  placeholder="Paste an email, call notes, news article, or any update about this company…"
                  value={updateContent}
                  onChange={(e) => setUpdateContent(e.target.value)}
                  rows={4}
                  className="mb-3"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleAddUpdate}
                    disabled={submitting || !updateContent.trim()}
                  >
                    {submitting ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    ) : (
                      <Send className="mr-1.5 size-4" />
                    )}
                    {submitting ? "Saving…" : "Save & Index"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddUpdate(false)}
                  >
                    Cancel
                  </Button>
                  <p className="text-muted-foreground ml-auto text-xs">
                    Indexed for AI agents automatically
                  </p>
                </div>
              </div>
            )}

            {/* Updates list / audit trail */}
            <div className="divide-y">
              {updatesLoading ? (
                <div className="space-y-2 p-5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 animate-pulse rounded-lg bg-muted"
                    />
                  ))}
                </div>
              ) : updates.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <MessageSquare className="text-muted-foreground mb-3 size-8" />
                  <p className="text-muted-foreground text-sm">
                    No updates yet.
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Drop in emails, call notes, or any context so the AI stays
                    current.
                  </p>
                </div>
              ) : (
                updates.map((u) => (
                  <div key={u.id} className="px-5 py-4">
                    {/* Audit header */}
                    <div className="mb-2 flex items-center gap-2 text-xs">
                      <Clock className="text-muted-foreground size-3" />
                      <span className="text-muted-foreground">
                        {new Date(u.created_at).toLocaleString()}
                      </span>
                      {u.source && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                          {u.source}
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        by {u.created_by}
                      </span>
                    </div>
                    {/* Content */}
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {u.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
