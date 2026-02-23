"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { ArrowLeft, Briefcase, FileText, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { dealflowApi, type DealflowEntryUpdateBody } from "@/lib/api";
import type { DealflowDocument, DealflowEntry, DealflowFounder } from "@/types";

const STATUS_OPTIONS = [
  { value: "none", label: "None" },
  { value: "reached_out", label: "Reached out" },
  { value: "in_diligence", label: "In diligence" },
  { value: "passed", label: "Passed" },
  { value: "invested", label: "Invested" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "—" },
  { value: "murtaza", label: "Murtaza" },
  { value: "carter", label: "Carter" },
  { value: "friend", label: "Friend" },
  { value: "twitter", label: "Twitter" },
  { value: "newsletter", label: "Newsletter" },
  { value: "event", label: "Event" },
  { value: "other", label: "Other" },
];

const STAGE_OPTIONS = [
  { value: "", label: "—" },
  { value: "Pre-seed", label: "Pre-seed" },
  { value: "Seed", label: "Seed" },
  { value: "Series A", label: "Series A" },
  { value: "Series B", label: "Series B" },
  { value: "Other", label: "Other" },
];

export default function DealflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const entryId = params.id as string;
  const { user, loading: authLoading } = useAuth();

  const [entry, setEntry] = useState<DealflowEntry | null>(null);
  const [documents, setDocuments] = useState<DealflowDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [showAddFounder, setShowAddFounder] = useState(false);
  const [newFounderName, setNewFounderName] = useState("");
  const [newFounderLinkedIn, setNewFounderLinkedIn] = useState("");
  const [newFounderTwitter, setNewFounderTwitter] = useState("");
  const [newFounderEmail, setNewFounderEmail] = useState("");
  const [showDocLink, setShowDocLink] = useState(false);
  const [newDocType, setNewDocType] = useState("pitch_deck");
  const [newDocUrl, setNewDocUrl] = useState("");
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadEntry = useCallback(() => {
    dealflowApi.entries.get(entryId).then(setEntry).catch(() => router.push("/dealflow"));
  }, [entryId, router]);

  const loadDocuments = useCallback(() => {
    dealflowApi.documents.list(entryId).then(setDocuments).catch(() => {});
  }, [entryId]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/dealflow");
      return;
    }
    if (!authLoading && user) {
      setLoading(true);
      Promise.all([dealflowApi.entries.get(entryId), dealflowApi.documents.list(entryId)])
        .then(([e, docs]) => {
          setEntry(e);
          setDocuments(docs);
        })
        .catch(() => router.push("/dealflow"))
        .finally(() => setLoading(false));
    }
  }, [authLoading, user, entryId, router]);

  const save = async (body: DealflowEntryUpdateBody) => {
    setSaving(true);
    try {
      const updated = await dealflowApi.entries.update(entryId, body);
      setEntry(updated);
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handlePromote = async () => {
    setPromoting(true);
    try {
      const { company_id } = await dealflowApi.entries.promoteToDealRoom(entryId, true);
      toast.success("Promoted to Active Deals");
      setShowPromoteModal(false);
      router.push(`/dealroom/${company_id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Promote failed";
      toast.error(msg);
    } finally {
      setPromoting(false);
    }
  };

  const handleAddFounder = async () => {
    if (!newFounderName.trim()) return;
    try {
      const created = await dealflowApi.entries.addFounder(entryId, {
        name: newFounderName.trim(),
        ...(newFounderLinkedIn.trim() && { linkedin_url: newFounderLinkedIn.trim() }),
        ...(newFounderTwitter.trim() && { twitter_url: newFounderTwitter.trim() }),
        ...(newFounderEmail.trim() && { email: newFounderEmail.trim() }),
      });
      setEntry((prev) => prev ? { ...prev, founders: [...prev.founders, created] } : prev);
      setNewFounderName("");
      setNewFounderLinkedIn("");
      setNewFounderTwitter("");
      setNewFounderEmail("");
      setShowAddFounder(false);
      toast.success("Founder added");
    } catch {
      toast.error("Failed to add founder");
    }
  };

  const handleDeleteFounder = async (founder: DealflowFounder) => {
    if (!confirm(`Remove ${founder.name}?`)) return;
    try {
      await dealflowApi.entries.deleteFounder(entryId, founder.id);
      setEntry((prev) => prev ? { ...prev, founders: prev.founders.filter((f) => f.id !== founder.id) } : prev);
      toast.success("Founder removed");
    } catch {
      toast.error("Failed to remove");
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const doc = await dealflowApi.documents.uploadFile(entryId, file, "pitch_deck");
      setDocuments((prev) => [doc, ...prev]);
      toast.success("Document uploaded");
    } catch {
      toast.error("Upload failed");
    }
  };

  const handleAddDocLink = async () => {
    try {
      const doc = await dealflowApi.documents.addLink(entryId, {
        type: newDocType,
        ...(newDocUrl.trim() && { url: newDocUrl.trim() }),
      });
      setDocuments((prev) => [doc, ...prev]);
      setNewDocUrl("");
      setShowDocLink(false);
      toast.success("Document added");
    } catch {
      toast.error("Failed to add document");
    }
  };

  const handleDownloadDoc = async (doc: DealflowDocument) => {
    try {
      await dealflowApi.documents.downloadFile(entryId, doc.id, doc.original_filename ?? undefined);
    } catch {
      toast.error("Download failed");
    }
  };

  const handleDeleteDoc = async (doc: DealflowDocument) => {
    if (!confirm("Delete this document?")) return;
    try {
      await dealflowApi.documents.delete(entryId, doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      toast.success("Document deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (loading || !entry) {
    return (
      <div className="container mx-auto max-w-4xl px-6 pt-10 pb-20">
        <div className="mb-6 h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-6 pt-10 pb-20">
      <Link
        href="/dealflow"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Dealflow
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{entry.name}</h1>
          {entry.promoted_company_id && (
            <Link
              href={`/dealroom/${entry.promoted_company_id}`}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-green-500/15 px-2.5 py-1 text-sm text-green-700 dark:text-green-400"
            >
              <Briefcase className="size-4" />
              Already in Active Deals →
            </Link>
          )}
        </div>
        {!entry.promoted_company_id && (
          <Button
            onClick={() => setShowPromoteModal(true)}
            className="gap-1.5"
          >
            <Briefcase className="size-4" />
            Promote to Active Deals
          </Button>
        )}
      </div>

      {/* Editable fields */}
      <div className="mb-10 rounded-xl border bg-card p-4 shadow-sm space-y-4">
        <h3 className="font-medium">Company details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor="dealflow-name" className="text-muted-foreground text-xs font-medium">Name</label>
            <Input
              id="dealflow-name"
              defaultValue={entry.name}
              onBlur={(e) => e.target.value !== entry.name && save({ name: e.target.value })}
              className="mt-0.5"
            />
          </div>
          <div>
            <label htmlFor="dealflow-website" className="text-muted-foreground text-xs font-medium">Website</label>
            <Input
              id="dealflow-website"
              defaultValue={entry.website ?? ""}
              placeholder="https://…"
              onBlur={(e) => save({ website: e.target.value || undefined })}
              className="mt-0.5"
            />
          </div>
          <div>
            <label htmlFor="dealflow-company-linkedin" className="text-muted-foreground text-xs font-medium">Company LinkedIn</label>
            <Input
              id="dealflow-company-linkedin"
              defaultValue={entry.company_linkedin_url ?? ""}
              placeholder="https://linkedin.com/company/…"
              onBlur={(e) => save({ company_linkedin_url: e.target.value || undefined })}
              className="mt-0.5"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="dealflow-one-liner" className="text-muted-foreground text-xs font-medium">One-liner</label>
            <Input
              id="dealflow-one-liner"
              defaultValue={entry.one_liner ?? ""}
              onBlur={(e) => save({ one_liner: e.target.value || undefined })}
              className="mt-0.5"
            />
          </div>
          <div>
            <label htmlFor="dealflow-location" className="text-muted-foreground text-xs font-medium">Location</label>
            <Input
              id="dealflow-location"
              defaultValue={entry.location ?? ""}
              onBlur={(e) => save({ location: e.target.value || undefined })}
              className="mt-0.5"
            />
          </div>
          <div>
            <label htmlFor="dealflow-stage" className="text-muted-foreground text-xs font-medium">Stage</label>
            <select
              id="dealflow-stage"
              defaultValue={entry.stage ?? ""}
              onChange={(e) => save({ stage: e.target.value || undefined })}
              className="mt-0.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {STAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dealflow-amount-raising" className="text-muted-foreground text-xs font-medium">Amount raising ($)</label>
            <Input
              id="dealflow-amount-raising"
              type="number"
              defaultValue={entry.amount_raising ?? ""}
              onBlur={(e) => save({ amount_raising: e.target.value ? parseFloat(e.target.value) : undefined })}
              className="mt-0.5"
            />
          </div>
          <div>
            <label htmlFor="dealflow-valuation" className="text-muted-foreground text-xs font-medium">Valuation ($)</label>
            <Input
              id="dealflow-valuation"
              type="number"
              defaultValue={entry.valuation ?? ""}
              onBlur={(e) => save({ valuation: e.target.value ? parseFloat(e.target.value) : undefined })}
              className="mt-0.5"
            />
          </div>
          <div>
            <label htmlFor="dealflow-source" className="text-muted-foreground text-xs font-medium">Source</label>
            <select
              id="dealflow-source"
              defaultValue={entry.source_type ?? ""}
              onChange={(e) => save({ source_type: e.target.value || undefined })}
              className="mt-0.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dealflow-source-detail" className="text-muted-foreground text-xs font-medium">Source detail</label>
            <Input
              id="dealflow-source-detail"
              defaultValue={entry.source_detail ?? ""}
              placeholder="e.g. Twitter @xyz"
              onBlur={(e) => save({ source_detail: e.target.value || undefined })}
              className="mt-0.5"
            />
          </div>
          <div>
            <label htmlFor="dealflow-status" className="text-muted-foreground text-xs font-medium">Status</label>
            <select
              id="dealflow-status"
              defaultValue={entry.status}
              onChange={(e) => save({ status: e.target.value })}
              className="mt-0.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="dealflow-notes" className="text-muted-foreground text-xs font-medium">Notes</label>
            <textarea
              id="dealflow-notes"
              defaultValue={entry.notes ?? ""}
              onBlur={(e) => save({ notes: e.target.value || undefined })}
              rows={3}
              className="mt-0.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        {saving && <p className="text-muted-foreground text-xs">Saving…</p>}
      </div>

      {/* Founders */}
      <div className="mb-10 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Founders</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddFounder((v) => !v)}
          >
            <Plus className="mr-1 size-4" />
            Add founder
          </Button>
        </div>
        {showAddFounder && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border p-3 bg-muted/30">
            <Input
              placeholder="Name *"
              value={newFounderName}
              onChange={(e) => setNewFounderName(e.target.value)}
              className="max-w-[180px]"
            />
            <Input
              placeholder="LinkedIn URL"
              value={newFounderLinkedIn}
              onChange={(e) => setNewFounderLinkedIn(e.target.value)}
              className="max-w-[200px]"
            />
            <Input
              placeholder="Twitter URL"
              value={newFounderTwitter}
              onChange={(e) => setNewFounderTwitter(e.target.value)}
              className="max-w-[200px]"
            />
            <Input
              placeholder="Email"
              value={newFounderEmail}
              onChange={(e) => setNewFounderEmail(e.target.value)}
              className="max-w-[200px]"
            />
            <Button size="sm" onClick={handleAddFounder} disabled={!newFounderName.trim()}>
              Add
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAddFounder(false)}>
              Cancel
            </Button>
          </div>
        )}
        {entry.founders.length === 0 && !showAddFounder && (
          <p className="text-muted-foreground text-sm">No founders added yet.</p>
        )}
        <ul className="space-y-2">
          {entry.founders.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between rounded-md border bg-background/50 px-3 py-2"
            >
              <div className="min-w-0">
                <span className="font-medium">{f.name}</span>
                {(f.linkedin_url || f.twitter_url || f.email) && (
                  <div className="text-muted-foreground text-xs mt-0.5 truncate">
                    {[f.linkedin_url, f.twitter_url, f.email].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDeleteFounder(f)}
                className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Documents */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="font-medium flex items-center gap-2">
            <FileText className="size-4" />
            Documents ({documents.length})
          </h3>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.pptx,.doc"
              className="hidden"
              onChange={handleUploadFile}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1 size-4" />
              Upload file
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDocLink((v) => !v)}
            >
              Add link
            </Button>
          </div>
        </div>
        {showDocLink && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border p-3 bg-muted/30">
            <select
              value={newDocType}
              onChange={(e) => setNewDocType(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="pitch_deck">Pitch deck</option>
              <option value="other">Other</option>
            </select>
            <Input
              placeholder="URL (optional)"
              value={newDocUrl}
              onChange={(e) => setNewDocUrl(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <Button size="sm" onClick={handleAddDocLink}>Add</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowDocLink(false)}>Cancel</Button>
          </div>
        )}
        {documents.length === 0 && !showDocLink && (
          <p className="text-muted-foreground text-sm">No documents yet. Upload a pitch deck or add a link.</p>
        )}
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between rounded-md border bg-background/50 px-3 py-2"
            >
              <div className="min-w-0 flex items-center gap-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {doc.original_filename || doc.url || doc.type}
                </span>
                <span className="text-muted-foreground text-xs">{doc.status}</span>
              </div>
              <div className="flex gap-1">
                {doc.original_filename && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadDoc(doc)}
                  >
                    Download
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => handleDeleteDoc(doc)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={showPromoteModal}
        onOpenChange={setShowPromoteModal}
        title={`Promote "${entry.name}" to Active Deals?`}
        description="All dealflow info, founders, and documents will carry over. You can continue diligence from Active Deals."
        confirmLabel="Promote"
        loading={promoting}
        onConfirm={handlePromote}
      />
    </div>
  );
}
