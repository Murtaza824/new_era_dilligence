"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText,
  Pencil,
  RotateCcw,
  Plus,
  Send,
  X,
} from "lucide-react";

import Markdown from "react-markdown";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { memos as memosApi } from "@/lib/api";
import type { Memo } from "@/types";

interface Props {
  companyId: string;
  companyName: string;
  onMemoGenerated?: () => void;
}

export function MemoTab({ companyId, companyName, onMemoGenerated }: Props) {
  const [memo, setMemo] = useState<Memo | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set(),
  );
  const [viewMode, setViewMode] = useState<"sections" | "full">("sections");

  // Per-section refine state
  const [refiningIdx, setRefiningIdx] = useState<number | null>(null);
  const [refineInput, setRefineInput] = useState("");
  const [refineLoading, setRefineLoading] = useState(false);

  // Add context state
  const [showAddContext, setShowAddContext] = useState(false);
  const [contextInput, setContextInput] = useState("");
  const [addingContext, setAddingContext] = useState(false);
  const [contextSuccess, setContextSuccess] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    memosApi
      .get(companyId)
      .then(setMemo)
      .catch(() => setMemo(null))
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await memosApi.generate(companyId);
      setMemo(result);
      setExpandedSections(new Set(result.sections.map((_, i) => i)));
      onMemoGenerated?.();
      toast.success("Memo generated");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to generate memo";
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleRevise = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await memosApi.revise(companyId);
      setMemo(result);
      setExpandedSections(new Set(result.sections.map((_, i) => i)));
      onMemoGenerated?.();
      toast.success("Memo regenerated");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to revise memo";
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleRefineSection = async (sectionTitle: string) => {
    if (!refineInput.trim()) return;
    setRefineLoading(true);
    setError(null);
    try {
      const result = await memosApi.refineSection(
        companyId,
        sectionTitle,
        refineInput.trim(),
      );
      setMemo(result);
      setRefiningIdx(null);
      setRefineInput("");
      toast.success("Section refined");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to refine section";
      setError(msg);
      toast.error(msg);
    } finally {
      setRefineLoading(false);
    }
  };

  const handleRegenerateSection = async (sectionTitle: string) => {
    setRefineLoading(true);
    setError(null);
    try {
      const result = await memosApi.regenerateSection(companyId, sectionTitle);
      setMemo(result);
      toast.success("Section regenerated");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to regenerate section";
      setError(msg);
      toast.error(msg);
    } finally {
      setRefineLoading(false);
    }
  };

  const handleAddContext = async () => {
    if (!contextInput.trim()) return;
    setAddingContext(true);
    setError(null);
    setContextSuccess(null);
    try {
      const result = await memosApi.addContext(companyId, contextInput.trim());
      setContextInput("");
      setContextSuccess(result.content);
      onMemoGenerated?.();
      toast.success("Context added to knowledge base");
      setTimeout(() => setContextSuccess(null), 5000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to add context";
      setError(msg);
      toast.error(msg);
    } finally {
      setAddingContext(false);
    }
  };

  const startRefine = (idx: number) => {
    setRefiningIdx(idx);
    setRefineInput("");
    // Make sure the section is expanded
    setExpandedSections((prev) => new Set([...prev, idx]));
  };

  const cancelRefine = () => {
    setRefiningIdx(null);
    setRefineInput("");
  };

  const toggleSection = (idx: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (memo) {
      if (expandedSections.size === memo.sections.length) {
        setExpandedSections(new Set());
      } else {
        setExpandedSections(new Set(memo.sections.map((_, i) => i)));
      }
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="text-muted-foreground py-20 text-center">Loading…</div>
    );
  }

  // ── Generating overlay ─────────────────────────────────────────────────

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="text-muted-foreground mb-4 size-10 animate-spin" />
        <p className="text-lg font-medium">Generating investment memo…</p>
        <p className="text-muted-foreground mt-1 text-sm">
          This may take 1–2 minutes. Running 9 section agents + polish pass.
        </p>
      </div>
    );
  }

  // ── No memo yet ────────────────────────────────────────────────────────

  if (!memo) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-20">
        <FileText className="text-muted-foreground mb-4 size-12" />
        <p className="text-lg font-medium">No memo yet</p>
        <p className="text-muted-foreground mb-6 text-sm">
          Generate an investment memo from uploaded documents.
        </p>
        {error && (
          <p className="mb-4 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button onClick={handleGenerate} disabled={generating}>
          <Sparkles className="mr-1.5 size-4" />
          Generate Memo
        </Button>
      </div>
    );
  }

  // ── Memo display ───────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleRevise}>
          <RefreshCw className="mr-1.5 size-4" />
          Regenerate All
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddContext(!showAddContext)}
        >
          <Plus className="mr-1.5 size-4" />
          Add Context
        </Button>
        <a
          href={memosApi.exportUrl(companyId)}
          download
          className="inline-flex"
        >
          <Button variant="outline" size="sm">
            <Download className="mr-1.5 size-4" />
            Export Markdown
          </Button>
        </a>

        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex gap-1 rounded-lg border bg-muted p-0.5">
          <button
            onClick={() => setViewMode("sections")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === "sections"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Sections
          </button>
          <button
            onClick={() => setViewMode("full")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === "full"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Full
          </button>
        </div>

        {viewMode === "sections" && (
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {expandedSections.size === memo.sections.length
              ? "Collapse All"
              : "Expand All"}
          </Button>
        )}
      </div>

      {/* Add Context panel */}
      {showAddContext && (
        <div className="mb-6 rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">
              Add notes or context for this company
            </p>
            <button
              onClick={() => setShowAddContext(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="text-muted-foreground mb-3 text-xs">
            This will be indexed and used when generating or refining memo
            sections. Great for adding call notes, research findings, or
            specific details you want included.
          </p>
          <Textarea
            placeholder="e.g. Spoke with CEO — they mentioned planning to launch in EU market Q3 2026. Key customer is Stripe, paying $50k/year ARR…"
            value={contextInput}
            onChange={(e) => setContextInput(e.target.value)}
            rows={4}
            className="mb-3"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleAddContext}
              disabled={addingContext || !contextInput.trim()}
            >
              {addingContext ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 size-4" />
                  Add to Knowledge Base
                </>
              )}
            </Button>
            {contextSuccess && (
              <span className="text-xs text-green-600">{contextSuccess}</span>
            )}
          </div>
        </div>
      )}

      {/* Version info */}
      <div className="text-muted-foreground mb-4 text-xs">
        Version {memo.version} · Generated{" "}
        {new Date(memo.created_at).toLocaleString()}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Sections view */}
      {viewMode === "sections" && memo.sections.length > 0 && (
        <div className="space-y-2">
          {memo.sections.map((section, idx) => (
            <div key={idx} className="rounded-xl border bg-card">
              {/* Section header */}
              <div className="flex items-center justify-between px-5 py-4">
                <button
                  onClick={() => toggleSection(idx)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <h3 className="font-display text-base font-semibold">
                    {section.title}
                  </h3>
                  {expandedSections.has(idx) ? (
                    <ChevronUp className="text-muted-foreground size-4" />
                  ) : (
                    <ChevronDown className="text-muted-foreground size-4" />
                  )}
                </button>

                {/* Section action buttons */}
                {expandedSections.has(idx) && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startRefine(idx)}
                      className="text-muted-foreground hover:text-foreground rounded-md p-1.5 transition-colors hover:bg-muted"
                      title="Refine with instructions"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleRegenerateSection(section.title)}
                      disabled={refineLoading}
                      className="text-muted-foreground hover:text-foreground rounded-md p-1.5 transition-colors hover:bg-muted"
                      title="Regenerate section"
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Section content */}
              {expandedSections.has(idx) && (
                <div className="border-t px-5 py-4">
                  {/* Refine loading overlay for this section */}
                  {refineLoading && refiningIdx === idx && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                      <Loader2 className="size-4 animate-spin" />
                      Refining section…
                    </div>
                  )}

                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <Markdown>{section.content}</Markdown>
                  </div>

                  {/* Refine input */}
                  {refiningIdx === idx && (
                    <div className="mt-4 rounded-lg border bg-muted/50 p-4">
                      <p className="mb-2 text-sm font-medium">
                        How should this section be refined?
                      </p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="e.g. Add more detail about the AI moat, emphasize the 95% retention rate…"
                          value={refineInput}
                          onChange={(e) => setRefineInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && refineInput.trim()) {
                              handleRefineSection(section.title);
                            }
                          }}
                          className="flex-1"
                          autoFocus
                          disabled={refineLoading}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleRefineSection(section.title)}
                          disabled={refineLoading || !refineInput.trim()}
                        >
                          {refineLoading ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Send className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelRefine}
                          disabled={refineLoading}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Full markdown view */}
      {viewMode === "full" && (
        <div className="rounded-xl border bg-card p-6">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Markdown>{memo.content}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
}
