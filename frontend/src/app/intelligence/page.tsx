"use client";

import { useCallback, useEffect, useState } from "react";

import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Flag,
  Lightbulb,
  Loader2,
  Newspaper,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Star,
  TrendingUp,
  Trash2,
  Twitter,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { newsApi, type IntelligenceSourceCreateBody } from "@/lib/api";
import type { IntelligenceDigest, IntelligenceSource, NewsItem } from "@/types";

type FilterMode = "all" | "unread" | "flagged";

const SOURCE_TYPE_OPTIONS: { value: IntelligenceSource["source_type"]; label: string }[] = [
  { value: "twitter", label: "Twitter / X" },
  { value: "substack", label: "Substack" },
  { value: "rss", label: "RSS / Blog" },
];

function sourceTypeIcon(type: string) {
  switch (type) {
    case "twitter":
      return <Twitter className="h-4 w-4" />;
    case "substack":
      return <BookOpen className="h-4 w-4" />;
    case "rss":
      return <Rss className="h-4 w-4" />;
    default:
      return <Newspaper className="h-4 w-4" />;
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function identifierPlaceholder(type: string) {
  switch (type) {
    case "twitter":
      return "@handle";
    case "substack":
      return "slug.substack.com";
    case "rss":
      return "https://example.com/feed";
    default:
      return "identifier";
  }
}

function sentimentColor(s: string | null): string {
  switch (s) {
    case "positive":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
    case "negative":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
    case "mixed":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300";
    case "neutral":
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
}

function importanceBorder(importance: string | null): string {
  switch (importance) {
    case "high":
      return "border-l-4 border-l-orange-500";
    case "medium":
      return "border-l-4 border-l-blue-400";
    default:
      return "";
  }
}

export default function IntelligencePage() {
  const { user } = useAuth();

  // Sources
  const [sources, setSources] = useState<IntelligenceSource[]>([]);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [newSourceType, setNewSourceType] = useState<IntelligenceSource["source_type"]>("twitter");
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceIdentifier, setNewSourceIdentifier] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);

  // Feed
  const [items, setItems] = useState<NewsItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [searchQ, setSearchQ] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("");
  const [importanceFilter, setImportanceFilter] = useState("");

  // Digest
  const [digest, setDigest] = useState<IntelligenceDigest | null>(null);
  const [digestOpen, setDigestOpen] = useState(true);

  const loadSources = useCallback(async () => {
    setSourcesLoading(true);
    try {
      const data = await newsApi.sources.list();
      setSources(data);
    } catch {
      toast.error("Failed to load sources");
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const params: Parameters<typeof newsApi.list>[0] = { limit: 100 };
      if (filterMode === "unread") params.is_read = false;
      if (filterMode === "flagged") params.is_flagged = true;
      if (searchQ.trim()) params.q = searchQ.trim();
      if (sourceFilter) params.source_id = sourceFilter;
      const data = await newsApi.list(params);
      setItems(data);
    } catch {
      toast.error("Failed to load feed");
    } finally {
      setFeedLoading(false);
    }
  }, [filterMode, searchQ, sourceFilter]);

  const loadDigest = useCallback(async () => {
    try {
      const data = await newsApi.latestDigest();
      setDigest(data);
    } catch {
      // No digest yet — that's fine
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadSources();
      loadFeed();
      loadDigest();
    }
  }, [user, loadSources, loadFeed, loadDigest]);

  // ── Source actions ────────────────────────────

  async function handleAddSource() {
    if (!newSourceName.trim() || !newSourceIdentifier.trim()) return;
    setAddingSource(true);
    try {
      const body: IntelligenceSourceCreateBody = {
        source_type: newSourceType,
        name: newSourceName.trim(),
        identifier: newSourceIdentifier.trim(),
      };
      const created = await newsApi.sources.create(body);
      setSources((prev) => [created, ...prev]);
      toast.success("Source added");
      setNewSourceName("");
      setNewSourceIdentifier("");
    } catch {
      toast.error("Failed to add source");
    } finally {
      setAddingSource(false);
    }
  }

  async function handleDeleteSource() {
    if (!deletingSourceId) return;
    try {
      await newsApi.sources.delete(deletingSourceId);
      toast.success("Source removed");
      setSources((prev) => prev.filter((s) => s.id !== deletingSourceId));
    } catch {
      toast.error("Failed to delete source");
    } finally {
      setDeletingSourceId(null);
    }
  }

  // ── Feed actions ─────────────────────────────

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await newsApi.refresh();
      toast.success("Refreshing sources...");
      const poll = (attempt: number) => {
        setTimeout(async () => {
          await loadFeed();
          await loadDigest();
          if (attempt < 2) poll(attempt + 1);
          else setRefreshing(false);
        }, 2000);
      };
      poll(0);
    } catch {
      toast.error("Failed to trigger refresh");
      setRefreshing(false);
    }
  }

  async function handleToggleRead(item: NewsItem) {
    try {
      const updated = await newsApi.update(item.id, { is_read: !item.is_read });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch {
      toast.error("Failed to update");
    }
  }

  async function handleToggleFlag(item: NewsItem) {
    try {
      const updated = await newsApi.update(item.id, { is_flagged: !item.is_flagged });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch {
      toast.error("Failed to update");
    }
  }

  async function handleDismiss(item: NewsItem) {
    try {
      await newsApi.delete(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch {
      toast.error("Failed to dismiss");
    }
  }

  // ── Derived data ─────────────────────────────

  const entityNames = Array.from(new Set(items.map((i) => i.entity_name).filter(Boolean))) as string[];

  let filteredItems = items;
  if (entityFilter) filteredItems = filteredItems.filter((i) => i.entity_name === entityFilter);
  if (sentimentFilter) filteredItems = filteredItems.filter((i) => i.sentiment === sentimentFilter);
  if (importanceFilter) filteredItems = filteredItems.filter((i) => i.importance === importanceFilter);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Newspaper className="text-muted-foreground h-6 w-6" />
          <h1 className="text-2xl font-bold tracking-tight">Intelligence</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSourcesOpen((v) => !v)}
          >
            {sourcesOpen ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
            Manage Sources
          </Button>
          <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Source Management (collapsible) */}
      {sourcesOpen && (
        <div className="bg-muted/40 rounded-lg border p-4 space-y-4">
          <h2 className="text-sm font-semibold">Configured Sources</h2>
          {sourcesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sources configured yet.</p>
          ) : (
            <div className="space-y-2">
              {sources.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded border bg-background px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {sourceTypeIcon(s.source_type)}
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground">{s.identifier}</span>
                    {s.last_fetched_at && (
                      <span className="text-muted-foreground text-xs">
                        · fetched {timeAgo(s.last_fetched_at)}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setDeletingSourceId(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add Source form */}
          <div className="flex flex-wrap items-end gap-2 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor="source-type-select">Type</label>
              <select
                id="source-type-select"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={newSourceType}
                onChange={(e) => setNewSourceType(e.target.value as IntelligenceSource["source_type"])}
              >
                {SOURCE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor="source-name-input">Name</label>
              <Input
                id="source-name-input"
                className="h-9 w-44"
                placeholder="Display name"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor="source-id-input">Identifier</label>
              <Input
                id="source-id-input"
                className="h-9 w-64"
                placeholder={identifierPlaceholder(newSourceType)}
                value={newSourceIdentifier}
                onChange={(e) => setNewSourceIdentifier(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              className="h-9"
              disabled={addingSource || !newSourceName.trim() || !newSourceIdentifier.trim()}
              onClick={handleAddSource}
            >
              {addingSource ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Trends Digest Card */}
      {digest && (
        <div className="rounded-lg border bg-gradient-to-r from-blue-50/60 to-purple-50/60 dark:from-blue-950/30 dark:to-purple-950/30 p-4 space-y-3">
          <button
            className="flex w-full items-center justify-between"
            onClick={() => setDigestOpen((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span className="font-semibold text-sm">Trends &amp; Insights</span>
              {digest.overall_sentiment && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sentimentColor(digest.overall_sentiment)}`}>
                  {digest.overall_sentiment}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                · {digest.item_count} items · {timeAgo(digest.created_at)}
              </span>
            </div>
            {digestOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {digestOpen && (
            <div className="space-y-3 pt-1">
              {/* Top topics */}
              {digest.top_topics && (
                <div className="flex flex-wrap gap-1.5">
                  {digest.top_topics.split(",").map((t) => t.trim()).filter(Boolean).map((topic) => (
                    <span
                      key={topic}
                      className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}

              {/* Summary bullets */}
              <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                {digest.summary}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4" />
          <Input
            className="pl-8"
            placeholder="Search headlines..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </div>

        {/* Filter toggles */}
        <div className="flex rounded-md border">
          {(["all", "unread", "flagged"] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filterMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              } ${mode === "all" ? "rounded-l-md" : ""} ${mode === "flagged" ? "rounded-r-md" : ""}`}
              onClick={() => setFilterMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Source filter */}
        {sources.length > 0 && (
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {/* Sentiment filter */}
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={sentimentFilter}
          onChange={(e) => setSentimentFilter(e.target.value)}
        >
          <option value="">All sentiment</option>
          <option value="positive">Positive</option>
          <option value="negative">Negative</option>
          <option value="neutral">Neutral</option>
          <option value="mixed">Mixed</option>
        </select>

        {/* Importance filter */}
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={importanceFilter}
          onChange={(e) => setImportanceFilter(e.target.value)}
        >
          <option value="">All importance</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Entity filter */}
        {entityNames.length > 0 && (
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
          >
            <option value="">All companies</option>
            {entityNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Feed */}
      {feedLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading feed...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <Newspaper className="mb-3 h-10 w-10 text-muted-foreground/50" />
          {sources.length === 0 ? (
            <>
              <p className="text-muted-foreground font-medium">No sources configured yet</p>
              <p className="text-muted-foreground text-sm mt-1">
                Add Twitter handles, Substacks, or RSS feeds to start tracking.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setSourcesOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Add Sources
              </Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground font-medium">No items match your filters</p>
              <p className="text-muted-foreground text-sm mt-1">
                Try adjusting filters or refreshing to fetch new content.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg border p-4 transition-colors ${importanceBorder(item.importance)} ${
                item.is_read ? "bg-muted/30 opacity-70" : "bg-background"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  {/* Source + sentiment + time */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {sourceTypeIcon(
                      sources.find((s) => s.id === item.intelligence_source_id)?.source_type ?? "rss"
                    )}
                    <span>{item.source_name}</span>
                    {item.sentiment && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sentimentColor(item.sentiment)}`}>
                        {item.sentiment}
                      </span>
                    )}
                    <span>·</span>
                    <span>{timeAgo(item.fetched_at)}</span>
                  </div>

                  {/* Headline */}
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-1 font-semibold leading-snug hover:underline"
                    >
                      {item.headline}
                      <ExternalLink className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
                    </a>
                  ) : (
                    <p className="font-semibold leading-snug">{item.headline}</p>
                  )}

                  {/* Snippet */}
                  {item.snippet && (
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {item.snippet}
                    </p>
                  )}

                  {/* Insight */}
                  {item.insight && (
                    <div className="flex items-start gap-1.5 text-sm">
                      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <p className="italic text-muted-foreground">{item.insight}</p>
                    </div>
                  )}

                  {/* Topics + portfolio badge */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.topics && item.topics.split(",").map((t) => t.trim()).filter(Boolean).map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        {topic}
                      </span>
                    ))}
                    {item.entity_name && (
                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                        {item.entity_name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={item.is_flagged ? "Unflag" : "Flag"}
                    onClick={() => handleToggleFlag(item)}
                  >
                    {item.is_flagged ? (
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    ) : (
                      <Flag className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={item.is_read ? "Mark unread" : "Mark read"}
                    onClick={() => handleToggleRead(item)}
                  >
                    <Check className={`h-3.5 w-3.5 ${item.is_read ? "text-green-500" : ""}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    title="Dismiss"
                    onClick={() => handleDismiss(item)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete source confirm */}
      <ConfirmDialog
        open={!!deletingSourceId}
        onOpenChange={(open) => { if (!open) setDeletingSourceId(null); }}
        title="Remove source?"
        description="This won't delete existing news items, but the source will stop being fetched."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleDeleteSource}
      />
    </div>
  );
}
