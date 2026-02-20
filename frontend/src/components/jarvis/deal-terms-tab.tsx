"use client";

import { useState } from "react";

import { FileText, Globe, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

import { GeneratingIndicator } from "@/components/jarvis/generating-indicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { companies as companiesApi } from "@/lib/api";
import type { Company, DealSuggestions } from "@/types";

function fmtNum(v: number | null): string {
  if (v == null) return "";
  if (v >= 1_000_000) return String(v / 1_000_000);
  if (v >= 1_000) return String(v / 1_000);
  return String(v);
}

function parseNum(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (!t) return null;
  const n = parseFloat(t);
  if (Number.isNaN(n)) return null;
  if (t.endsWith("M") || t.endsWith("m")) return n * 1_000_000;
  if (t.endsWith("K") || t.endsWith("k")) return n * 1_000;
  return n;
}

const STAGE_OPTIONS = ["", "Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Growth"];

interface Props {
  companyId: string;
  company: Company;
  onSaved: (updated: Company) => void;
}

export function DealTermsTab({ companyId, company, onSaved }: Props) {
  const [entryValuation, setEntryValuation] = useState(
    company.entry_valuation != null ? fmtNum(company.entry_valuation) + (company.entry_valuation >= 1_000_000 ? "M" : "") : "",
  );
  const [amountRaising, setAmountRaising] = useState(
    company.amount_raising != null ? fmtNum(company.amount_raising) + (company.amount_raising >= 1_000_000 ? "M" : "") : "",
  );
  const [investmentStage, setInvestmentStage] = useState(company.investment_stage ?? "");
  const [saving, setSaving] = useState(false);
  const [suggestingDocs, setSuggestingDocs] = useState(false);
  const [suggestingWeb, setSuggestingWeb] = useState(false);
  const [suggestions, setSuggestions] = useState<DealSuggestions | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await companiesApi.update(companyId, {
        entry_valuation: parseNum(entryValuation),
        amount_raising: parseNum(amountRaising),
        investment_stage: investmentStage.trim() || null,
      });
      onSaved(updated);
      setEntryValuation(updated.entry_valuation != null ? fmtNum(updated.entry_valuation) + (updated.entry_valuation >= 1_000_000 ? "M" : "") : "");
      setAmountRaising(updated.amount_raising != null ? fmtNum(updated.amount_raising) + (updated.amount_raising >= 1_000_000 ? "M" : "") : "");
      setInvestmentStage(updated.investment_stage ?? "");
      setSuggestions(null);
      toast.success("Deal terms saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const suggestFromDocuments = async () => {
    setSuggestingDocs(true);
    setSuggestions(null);
    try {
      const res = await companiesApi.suggestDealFromDocuments(companyId);
      setSuggestions(res);
      if (!res.entry_valuation && !res.amount_raising && !res.investment_stage) {
        toast.info("No deal terms found in documents");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to get suggestions");
    } finally {
      setSuggestingDocs(false);
    }
  };

  const suggestFromWeb = async () => {
    setSuggestingWeb(true);
    setSuggestions(null);
    try {
      const res = await companiesApi.suggestDealFromWeb(companyId);
      setSuggestions(res);
      if (!res.entry_valuation && !res.amount_raising && !res.investment_stage) {
        toast.info("No deal terms found from website");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to get suggestions");
    } finally {
      setSuggestingWeb(false);
    }
  };

  const applySuggestions = () => {
    if (!suggestions) return;
    if (suggestions.entry_valuation != null) {
      setEntryValuation(suggestions.entry_valuation >= 1_000_000 ? fmtNum(suggestions.entry_valuation) + "M" : String(suggestions.entry_valuation));
    }
    if (suggestions.amount_raising != null) {
      setAmountRaising(suggestions.amount_raising >= 1_000_000 ? fmtNum(suggestions.amount_raising) + "M" : String(suggestions.amount_raising));
    }
    if (suggestions.investment_stage != null) {
      setInvestmentStage(suggestions.investment_stage);
    }
    setSuggestions(null);
    toast.success("Applied suggestions — edit if needed and click Save");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <h2 className="font-display mb-4 text-lg font-semibold">Deal Terms</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Manual entry is the source of truth. Use &quot;Suggest from documents&quot; or &quot;Suggest from web&quot; to pre-fill, then edit and save.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="entry_valuation">Entry valuation ($)</Label>
            <Input
              id="entry_valuation"
              placeholder="e.g. 15M or 15000000"
              value={entryValuation}
              onChange={(e) => setEntryValuation(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="amount_raising">Amount raising ($)</Label>
            <Input
              id="amount_raising"
              placeholder="e.g. 2M or 2000000"
              value={amountRaising}
              onChange={(e) => setAmountRaising(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="investment_stage">Investment stage</Label>
            <select
              id="investment_stage"
              value={investmentStage}
              onChange={(e) => setInvestmentStage(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {STAGE_OPTIONS.map((opt) => (
                <option key={opt || "blank"} value={opt}>
                  {opt || "—"}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="mr-1.5 size-4" />}
            Save
          </Button>
          <Button variant="outline" size="sm" disabled={suggestingDocs} onClick={suggestFromDocuments}>
            {suggestingDocs ? <Loader2 className="size-4 animate-spin" /> : <FileText className="mr-1.5 size-4" />}
            Suggest from documents
          </Button>
          <Button variant="outline" size="sm" disabled={suggestingWeb} onClick={suggestFromWeb}>
            {suggestingWeb ? <Loader2 className="size-4 animate-spin" /> : <Globe className="mr-1.5 size-4" />}
            Suggest from web
          </Button>
        </div>
      </div>

      {(suggestingDocs || suggestingWeb) && (
        <div className="mt-2">
          <GeneratingIndicator label={suggestingDocs ? "Analyzing documents…" : "Analyzing website…"} size="sm" />
        </div>
      )}

      {suggestions && (
        <div className="rounded-xl border border-dashed bg-muted/30 p-4">
          <p className="text-muted-foreground mb-2 text-sm font-medium">Suggested (from AI)</p>
          <div className="text-muted-foreground mb-3 text-sm">
            {suggestions.entry_valuation != null && (
              <span>Valuation: ${(suggestions.entry_valuation / 1_000_000).toFixed(1)}M</span>
            )}
            {suggestions.amount_raising != null && (
              <span className={suggestions.entry_valuation != null ? " ml-4" : ""}>
                Raising: ${(suggestions.amount_raising / 1_000_000).toFixed(1)}M
              </span>
            )}
            {suggestions.investment_stage && (
              <span className="ml-4">Stage: {suggestions.investment_stage}</span>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={applySuggestions}>
            Apply to form
          </Button>
        </div>
      )}
    </div>
  );
}
