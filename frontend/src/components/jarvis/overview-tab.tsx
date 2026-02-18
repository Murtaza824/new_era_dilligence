"use client";

import { useCallback, useEffect, useState } from "react";

import { ExternalLink, FileText, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { memos as memosApi } from "@/lib/api";
import { overviewAsParagraph, parseFoundersFromTeamContent } from "@/lib/memo-overview";
import type { Memo } from "@/types";

interface Props {
  companyId: string;
  companyName: string;
  onMemoGenerated?: () => void;
  setActiveTab?: (tab: "documents" | "memo" | "simulations") => void;
}

export function OverviewTab({
  companyId,
  companyName,
  onMemoGenerated,
  setActiveTab,
}: Props) {
  const [memo, setMemo] = useState<Memo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    memosApi
      .get(companyId)
      .then(setMemo)
      .catch(() => setMemo(null))
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const overviewSection = memo?.sections?.find((s) => s.title === "Company Overview");
  const teamSection = memo?.sections?.find((s) => s.title === "Team & Leadership");
  const founders = teamSection ? parseFoundersFromTeamContent(teamSection.content) : [];
  const hasOverview = overviewSection?.content?.trim() || founders.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }

  if (!memo || !hasOverview) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 p-10 text-center">
        <FileText className="text-muted-foreground mx-auto mb-4 size-12" />
        <p className="text-muted-foreground mb-2 font-medium">
          No overview yet
        </p>
        <p className="text-muted-foreground mb-6 max-w-sm text-sm">
          Generate an investment memo from your uploaded documents to see
          Company Overview and founders here.
        </p>
        {setActiveTab && (
          <Button
            onClick={() => setActiveTab("memo")}
            size="sm"
          >
            <Sparkles className="mr-1.5 size-4" />
            Go to Memo & Generate
          </Button>
        )}
        {!setActiveTab && (
          <Link href={`/companies/${companyId}`}>
            <Button size="sm">
              <Sparkles className="mr-1.5 size-4" />
              Generate memo
            </Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {overviewSection?.content?.trim() && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="font-display mb-4 text-lg font-semibold">
            Company Overview
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {overviewAsParagraph(overviewSection.content)}
          </p>
        </div>
      )}

      {founders.length > 0 && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="font-display mb-4 text-lg font-semibold">
            Founders
          </h2>
          <ul className="space-y-3">
            {founders.map((f) => (
              <li key={f.name} className="flex items-center gap-3">
                <img
                  src={`https://ui-avatars.com/api?name=${encodeURIComponent(f.name)}&size=40&background=random`}
                  alt=""
                  className="size-10 shrink-0 rounded-full object-cover"
                />
                {f.linkedInUrl ? (
                  <a
                    href={f.linkedInUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {f.name}
                    <ExternalLink className="size-3.5 shrink-0" />
                  </a>
                ) : (
                  <span className="font-medium">{f.name}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {setActiveTab && (
        <p className="text-muted-foreground text-sm">
          <button
            type="button"
            onClick={() => setActiveTab("memo")}
            className="font-medium underline hover:no-underline"
          >
            View full memo
          </button>{" "}
          for all sections.
        </p>
      )}
    </div>
  );
}
