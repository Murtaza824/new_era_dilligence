"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { ArrowLeft, Ban, Briefcase, ExternalLink, ImagePlus, Loader2, MapPin, Pencil, RefreshCw, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { CompanyLogo } from "@/components/company-logo";
import { DealTermsTab } from "@/components/jarvis/deal-terms-tab";
import { DocumentsTab } from "@/components/jarvis/documents-tab";
import { MemoTab } from "@/components/jarvis/memo-tab";
import { OverviewTab } from "@/components/jarvis/overview-tab";
import { SimulationTab } from "@/components/jarvis/simulation-tab";
import { TouchpointsSection } from "@/components/touchpoints-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { companies as companiesApi, portfolioApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Company } from "@/types";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  passed: { label: "Passed", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
};

type Tab = "overview" | "deal" | "documents" | "memo" | "simulations";

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  deal: "Deal Terms",
  documents: "Documents",
  memo: "Memo",
  simulations: "Simulations",
};

const VALID_TABS: Tab[] = ["overview", "deal", "documents", "memo", "simulations"];

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params.id as string;

  const tabFromUrl = searchParams.get("tab");
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [addingToPortfolio, setAddingToPortfolio] = useState(false);
  const [refreshingLogo, setRefreshingLogo] = useState(false);
  const [editingLogo, setEditingLogo] = useState(false);
  const [logoUrlInput, setLogoUrlInput] = useState("");
  const [savingLogo, setSavingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingLogo) logoInputRef.current?.focus();
  }, [editingLogo]);

  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl as Tab)) {
      setTab(tabFromUrl as Tab);
    }
  }, [tabFromUrl]);

  const refreshCompany = useCallback(() => {
    companiesApi.get(companyId).then(setCompany).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    companiesApi
      .get(companyId)
      .then(setCompany)
      .catch(() => router.push("/dealroom"))
      .finally(() => setLoading(false));
  }, [companyId, router]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl px-6 pt-10 pb-20">
        {/* Skeleton back link */}
        <div className="mb-6 h-4 w-28 animate-pulse rounded bg-muted" />
        {/* Skeleton header */}
        <div className="mb-8">
          <div className="mb-2 h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
        {/* Skeleton tabs */}
        <div className="mb-6 flex gap-1 rounded-lg border bg-muted p-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 w-28 animate-pulse rounded-md bg-background/50" />
          ))}
        </div>
        {/* Skeleton content area */}
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (!company) return null;

  return (
    <div className="container mx-auto max-w-5xl px-6 pt-10 pb-20">
      {/* Back link */}
      <Link
        href="/dealroom"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Active Deals
      </Link>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="relative group/logo">
            <CompanyLogo name={company.name} logoUrl={company.logo_url ?? null} size="lg" />
            <button
              type="button"
              onClick={() => { setEditingLogo(true); setLogoUrlInput(company.logo_url ?? ""); }}
              className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 group-hover/logo:opacity-100 transition-opacity cursor-pointer"
              title="Edit logo"
            >
              <Pencil className="size-4 text-white" />
            </button>
          </div>
          {editingLogo && (
            <div className="flex flex-col gap-1.5 self-center">
              <div className="flex items-center gap-1.5">
                <Input
                  placeholder="Paste logo URL…"
                  value={logoUrlInput}
                  onChange={(e) => setLogoUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!logoUrlInput.trim()) return;
                      setSavingLogo(true);
                      companiesApi
                        .update(companyId, { logo_url: logoUrlInput.trim() })
                        .then((updated) => { setCompany(updated); setEditingLogo(false); toast.success("Logo updated"); })
                        .catch(() => toast.error("Failed to save logo"))
                        .finally(() => setSavingLogo(false));
                    }
                    if (e.key === "Escape") setEditingLogo(false);
                  }}
                  className="h-8 w-56 text-xs"
                  ref={logoInputRef}
                />
                <Button
                  size="icon-sm"
                  disabled={savingLogo || !logoUrlInput.trim()}
                  onClick={() => {
                    setSavingLogo(true);
                    companiesApi
                      .update(companyId, { logo_url: logoUrlInput.trim() })
                      .then((updated) => { setCompany(updated); setEditingLogo(false); toast.success("Logo updated"); })
                      .catch(() => toast.error("Failed to save logo"))
                      .finally(() => setSavingLogo(false));
                  }}
                >
                  {savingLogo ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                </Button>
                <button
                  type="button"
                  onClick={() => setEditingLogo(false)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">Paste an image URL and press Enter</p>
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                {company.name}
              </h1>
              {company.deal_status && company.deal_status !== "active" && STATUS_BADGE[company.deal_status] && (
                <span className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
                  STATUS_BADGE[company.deal_status].className,
                )}>
                  {STATUS_BADGE[company.deal_status].label}
                </span>
              )}
            </div>
            {company.one_liner && (
              <p className="text-muted-foreground mt-1 text-sm italic">{company.one_liner}</p>
            )}
            <p className="text-muted-foreground mt-1 text-sm">
              {company.document_count} document{company.document_count !== 1 ? "s" : ""} uploaded
              {company.has_memo && " · Memo generated"}
              {(company.investment_stage || company.entry_valuation != null || company.amount_raising != null) && (
                <>
                  {" · "}
                  {[company.investment_stage && company.investment_stage.replace(/\b\w/g, (c: string) => c.toUpperCase()), company.entry_valuation != null && `$${(company.entry_valuation / 1e6).toFixed(1)}M val`, company.amount_raising != null && `$${(company.amount_raising / 1e6).toFixed(1)}M raising`].filter(Boolean).join(" · ")}
                </>
              )}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {company.location && (
                <span className="flex items-center gap-1"><MapPin className="size-3" />{company.location}</span>
              )}
              {company.source_type && (
                <span>Source: {company.source_type}{company.source_detail ? ` — ${company.source_detail}` : ""}</span>
              )}
              {company.company_linkedin_url && (
                <a href={company.company_linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400">
                  LinkedIn <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(!company.deal_status || company.deal_status === "active") && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const updated = await companiesApi.updateStatus(companyId, "passed");
                    setCompany(updated);
                    toast.success("Marked as passed — materials saved");
                  } catch { toast.error("Failed to update"); }
                }}
              >
                <Ban className="mr-1.5 size-4" />
                Pass
              </Button>
            </>
          )}
          {company.deal_status && company.deal_status !== "active" && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const updated = await companiesApi.updateStatus(companyId, "active");
                  setCompany(updated);
                  toast.success("Deal reactivated");
                } catch { toast.error("Failed to reactivate"); }
              }}
            >
              <RotateCcw className="mr-1.5 size-4" />
              Reactivate
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={refreshingLogo}
            onClick={async () => {
              setRefreshingLogo(true);
              try {
                const updated = await companiesApi.refreshLogo(companyId);
                setCompany(updated);
                toast.success(updated.logo_url ? "Logo updated" : "No logo found for website");
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : "Failed to refresh logo");
              } finally {
                setRefreshingLogo(false);
              }
            }}
            title="Re-resolve logo from latest website document"
          >
            {refreshingLogo ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh logo
          </Button>
          <Button
          variant="outline"
          size="sm"
          disabled={addingToPortfolio}
          onClick={async () => {
            setAddingToPortfolio(true);
            try {
              await portfolioApi.addFromCompany(companyId);
              setCompany((prev) => prev ? { ...prev, deal_status: "portfolio" } : prev);
              toast.success(`${company.name} added to portfolio`);
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : "Failed to add to portfolio";
              toast.error(msg);
            } finally {
              setAddingToPortfolio(false);
            }
          }}
        >
          {addingToPortfolio ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <Briefcase className="mr-1.5 size-4" />
          )}
          Add to Portfolio
        </Button>
        </div>
      </div>

      {/* Dealflow context: founders and notes */}
      {(company.dealflow_founders.length > 0 || company.notes) && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {company.dealflow_founders.length > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Founders</h3>
              <ul className="space-y-1.5">
                {company.dealflow_founders.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{f.name}</span>
                    {f.linkedin_url && (
                      <a href={f.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400 text-xs">LinkedIn</a>
                    )}
                    {f.email && (
                      <a href={`mailto:${f.email}`} className="text-muted-foreground text-xs">{f.email}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {company.notes && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{company.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 rounded-lg border bg-muted p-1">
        {(["overview", "deal", "documents", "memo", "simulations"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (<>
        <OverviewTab
          companyId={companyId}
          companyName={company.name}
          onMemoGenerated={refreshCompany}
          setActiveTab={setTab}
        />
        <div className="mt-8 rounded-xl border bg-card p-4 shadow-sm">
          <TouchpointsSection companyId={companyId} />
        </div>
      </>)}
      {tab === "deal" && (
        <DealTermsTab key={company.updated_at} companyId={companyId} company={company} onSaved={setCompany} />
      )}
      {tab === "documents" && <DocumentsTab companyId={companyId} onDocumentsChanged={refreshCompany} />}
      {tab === "memo" && <MemoTab companyId={companyId} companyName={company.name} onMemoGenerated={refreshCompany} />}
      {tab === "simulations" && <SimulationTab companyId={companyId} companyName={company.name} />}
    </div>
  );
}
