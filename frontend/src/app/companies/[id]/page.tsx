"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { ArrowLeft, Briefcase, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { CompanyLogo } from "@/components/company-logo";
import { DealTermsTab } from "@/components/jarvis/deal-terms-tab";
import { DocumentsTab } from "@/components/jarvis/documents-tab";
import { MemoTab } from "@/components/jarvis/memo-tab";
import { OverviewTab } from "@/components/jarvis/overview-tab";
import { SimulationTab } from "@/components/jarvis/simulation-tab";
import { Button } from "@/components/ui/button";
import { companies as companiesApi, portfolioApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Company } from "@/types";

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
      .catch(() => router.push("/companies"))
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
        href="/companies"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        All Companies
      </Link>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <CompanyLogo name={company.name} logoUrl={company.logo_url ?? null} size="lg" />
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {company.name}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {company.document_count} document{company.document_count !== 1 ? "s" : ""} uploaded
              {company.has_memo && " · Memo generated"}
              {(company.investment_stage || company.entry_valuation != null || company.amount_raising != null) && (
                <>
                  {" · "}
                  {[company.investment_stage, company.entry_valuation != null && `$${(company.entry_valuation / 1e6).toFixed(1)}M val`, company.amount_raising != null && `$${(company.amount_raising / 1e6).toFixed(1)}M raising`].filter(Boolean).join(" · ")}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
      {tab === "overview" && (
        <OverviewTab
          companyId={companyId}
          companyName={company.name}
          onMemoGenerated={refreshCompany}
          setActiveTab={setTab}
        />
      )}
      {tab === "deal" && (
        <DealTermsTab key={company.updated_at} companyId={companyId} company={company} onSaved={setCompany} />
      )}
      {tab === "documents" && <DocumentsTab companyId={companyId} onDocumentsChanged={refreshCompany} />}
      {tab === "memo" && <MemoTab companyId={companyId} companyName={company.name} onMemoGenerated={refreshCompany} />}
      {tab === "simulations" && <SimulationTab companyId={companyId} companyName={company.name} />}
    </div>
  );
}
