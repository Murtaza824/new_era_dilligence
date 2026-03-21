"use client";

import { useCallback, useEffect, useState } from "react";

import { ChevronDown, ChevronRight, Mail, MessageSquare, Phone, Plus, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { touchpointsApi, type Touchpoint, type TouchpointCreateBody } from "@/lib/api";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS = [
  { value: "call", label: "Call", icon: Phone },
  { value: "meeting", label: "Meeting", icon: Users },
  { value: "email", label: "Email", icon: Mail },
  { value: "other", label: "Other", icon: MessageSquare },
];

const TYPE_ICON: Record<string, typeof Phone> = Object.fromEntries(
  TYPE_OPTIONS.map((o) => [o.value, o.icon])
);

export function TouchpointsSection({
  dealflowEntryId,
  companyId,
}: {
  dealflowEntryId?: string;
  companyId?: string;
}) {
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [newType, setNewType] = useState("call");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newLink, setNewLink] = useState("");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(() => {
    setLoading(true);
    touchpointsApi
      .list({
        dealflow_entry_id: dealflowEntryId,
        company_id: companyId,
      })
      .then(setTouchpoints)
      .catch(() => toast.error("Failed to load touchpoints"))
      .finally(() => setLoading(false));
  }, [dealflowEntryId, companyId]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleCreate = async () => {
    if (!newContent.trim() && !newTitle.trim()) return;
    setCreating(true);
    try {
      const body: TouchpointCreateBody = {
        ...(dealflowEntryId && { dealflow_entry_id: dealflowEntryId }),
        ...(companyId && { company_id: companyId }),
        type: newType,
        title: newTitle.trim() || undefined,
        content: newContent.trim() || undefined,
        external_link: newLink.trim() || undefined,
        occurred_at: new Date(newDate).toISOString(),
      };
      const created = await touchpointsApi.create(body);
      setTouchpoints((prev) => [created, ...prev]);
      setNewTitle("");
      setNewContent("");
      setNewLink("");
      setNewType("call");
      setNewDate(new Date().toISOString().slice(0, 10));
      setShowForm(false);
      toast.success("Touchpoint added");
    } catch {
      toast.error("Failed to add touchpoint");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this touchpoint?")) return;
    try {
      await touchpointsApi.delete(id);
      setTouchpoints((prev) => prev.filter((t) => t.id !== id));
      toast.success("Touchpoint deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Touchpoints</h2>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1.5 size-4" />
          Add touchpoint
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Input
              placeholder="Title (optional)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-40"
            />
          </div>
          <textarea
            placeholder="Paste call/meeting notes here…"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={5}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
          <Input
            placeholder="External link (Granola URL, email link, etc.)"
            value={newLink}
            onChange={(e) => setNewLink(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={creating || (!newContent.trim() && !newTitle.trim())}>
              {creating ? "Adding…" : "Add"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border bg-card" />
          ))}
        </div>
      )}

      {!loading && touchpoints.length === 0 && (
        <p className="text-muted-foreground text-sm py-6 text-center">No touchpoints yet.</p>
      )}

      {!loading && touchpoints.length > 0 && (
        <div className="space-y-2">
          {touchpoints.map((tp) => {
            const Icon = TYPE_ICON[tp.type] ?? MessageSquare;
            const isExpanded = expanded.has(tp.id);
            return (
              <div key={tp.id} className="rounded-lg border bg-card">
                <button
                  type="button"
                  onClick={() => toggleExpand(tp.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
                >
                  {isExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                  <Icon className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {tp.title || `${tp.type.charAt(0).toUpperCase() + tp.type.slice(1)} note`}
                    </p>
                    {tp.summary && !isExpanded && (
                      <p className="text-muted-foreground text-xs truncate mt-0.5">{tp.summary}</p>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs shrink-0">
                    {new Date(tp.occurred_at).toLocaleDateString()}
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 border-t pt-3 space-y-2">
                    {tp.summary && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
                        <p className="text-sm whitespace-pre-wrap">{tp.summary}</p>
                      </div>
                    )}
                    {tp.content && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Full notes</p>
                        <p className="text-sm whitespace-pre-wrap text-muted-foreground max-h-60 overflow-y-auto">{tp.content}</p>
                      </div>
                    )}
                    {tp.external_link && (
                      <a
                        href={tp.external_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-xs hover:underline inline-block"
                      >
                        External link
                      </a>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px]",
                        "bg-muted text-muted-foreground",
                      )}>
                        {tp.source ?? "manual"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(tp.id)}
                        className="text-destructive text-xs hover:underline ml-auto"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
