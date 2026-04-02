"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { ArrowLeft, Briefcase, ExternalLink, FileText, Globe, MapPin, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { CompanyLogo } from "@/components/company-logo";
import { LocationPicker } from "@/components/location-picker";
import { TouchpointsSection } from "@/components/touchpoints-section";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { dealflowApi, locationsApi, type DealflowEntryUpdateBody, type LocationItem } from "@/lib/api";
import type { DealflowDocument, DealflowEntry, DealflowFounder } from "@/types";

const STATUS_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "tracking", label: "Tracking" },
  { value: "active", label: "Active Deal" },
  { value: "reached_out", label: "Reached out" },
  { value: "passed", label: "Passed" },
  { value: "invested", label: "Invested" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "—" },
  { value: "venture_partner", label: "Venture Partner" },
  { value: "investor_intro", label: "Investor Intro" },
  { value: "lp_intro", label: "LP Intro" },
  { value: "self_sourced", label: "Self Sourced" },
];

const STAGE_OPTIONS = [
  { value: "", label: "—" },
  { value: "Pre-seed", label: "Pre-seed" },
  { value: "Seed", label: "Seed" },
  { value: "Series A", label: "Series A" },
  { value: "Series B", label: "Series B" },
  { value: "Other", label: "Other" },
];

function displayStatus(s: string): string {
  const match = STATUS_OPTIONS.find((o) => o.value === s);
  return match ? match.label : s.replace(/_/g, " ");
}

function displaySource(s: string): string {
  const match = SOURCE_OPTIONS.find((o) => o.value === s);
  return match ? match.label : s;
}

function fmtAmount(n: number | null | undefined): string | null {
  if (n == null) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default function DealflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const entryId = params.id as string;
  const { user, loading: authLoading } = useAuth();

  const [entry, setEntry] = useState<DealflowEntry | null>(null);
  const [documents, setDocuments] = useState<DealflowDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const editing = searchParams.get("edit") === "1";
  const [showAddFounder, setShowAddFounder] = useState(false);
  const [newFounderName, setNewFounderName] = useState("");
  const [newFounderLinkedIn, setNewFounderLinkedIn] = useState("");
  const [newFounderTwitter, setNewFounderTwitter] = useState("");
  const [newFounderEmail, setNewFounderEmail] = useState("");
  const [showDocLink, setShowDocLink] = useState(false);
  const [newDocType, setNewDocType] = useState("pitch_deck");
  const [newDocUrl, setNewDocUrl] = useState("");
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!authLoading && user) {
      locationsApi.list().then(setLocations).catch(() => {});
    }
  }, [authLoading, user]);

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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const updated = await dealflowApi.entries.uploadLogo(entryId, file);
      setEntry(updated);
      toast.success("Logo updated");
    } catch {
      toast.error("Failed to upload logo");
    }
  };

  const handleDeleteEntry = async () => {
    if (!confirm(`Delete "${entry?.name}" from dealflow? This cannot be undone.`)) return;
    try {
      await dealflowApi.entries.delete(entryId);
      toast.success("Entry deleted");
      router.push("/dealflow");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete";
      toast.error(msg);
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

  useEffect(() => {
    if (!editing && entry?.promoted_company_id) {
      router.replace(`/dealroom/${entry.promoted_company_id}`);
    }
  }, [editing, entry?.promoted_company_id, router]);

  if (loading || !entry) {
    return (
      <div className="container mx-auto max-w-5xl px-6 pt-10 pb-20">
        <div className="mb-6 h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="mb-8">
          <div className="mb-2 h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  const metaChips = [
    entry.stage,
    fmtAmount(entry.valuation) && `${fmtAmount(entry.valuation)} val`,
    fmtAmount(entry.amount_raising) && `${fmtAmount(entry.amount_raising)} raising`,
  ].filter(Boolean);

  return (
    <div className="container mx-auto max-w-5xl px-6 pt-10 pb-20">
      <Link
        href="/dealflow"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Dealflow
      </Link>

      {/* ─── VIEW MODE ─── */}
      {!editing && (
        <>
          {/* Rich header */}
          <div className="mb-8 flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="relative group/logo">
                <CompanyLogo name={entry.name} logoUrl={entry.logo_url} size="lg" />
                <input type="file" accept="image/*" ref={logoInputRef} onChange={handleLogoUpload} className="hidden" />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 group-hover/logo:opacity-100 transition-opacity cursor-pointer"
                  title="Upload logo"
                >
                  <Pencil className="size-4 text-white" />
                </button>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-display text-3xl font-semibold tracking-tight">{entry.name}</h1>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide">
                    {displayStatus(entry.status)}
                  </span>
                </div>
                {entry.one_liner && (
                  <p className="text-muted-foreground mt-1 text-sm italic">{entry.one_liner}</p>
                )}
                {metaChips.length > 0 && (
                  <p className="text-muted-foreground mt-1 text-sm">
                    {metaChips.join(" · ")}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {entry.location && (
                    <span className="flex items-center gap-1"><MapPin className="size-3" />{entry.location}</span>
                  )}
                  {entry.source_type && (
                    <span>Source: {displaySource(entry.source_type)}{entry.source_detail ? ` — ${entry.source_detail}` : ""}</span>
                  )}
                  {entry.website && (
                    <a href={entry.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400">
                      <Globe className="size-3" /> Website
                    </a>
                  )}
                  {entry.company_linkedin_url && (
                    <a href={entry.company_linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400">
                      LinkedIn <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.replace(`/dealflow/${entryId}?edit=1`, { scroll: false })}
              >
                <Pencil className="mr-1.5 size-4" />
                Edit
              </Button>
              {!(entry.promoted_company_id && entry.promoted_company_deal_status === "active") && (
                <Button size="sm" onClick={() => setShowPromoteModal(true)} className="gap-1.5">
                  <Briefcase className="size-4" />
                  Promote
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteEntry}
                className="gap-1.5 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </div>

          {/* Founders — horizontal chips (notes live in touchpoints) */}
          {entry.founders.length > 0 && (
            <div className="mb-6 rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Founders</h3>
              <div className="flex flex-wrap items-center gap-2">
                {entry.founders.map((f) => (
                  <div
                    key={f.id}
                    className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border bg-muted/40 px-3 py-2 text-sm shadow-sm"
                  >
                    <span className="font-medium">{f.name}</span>
                    {f.linkedin_url && (
                      <a href={f.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400 text-xs shrink-0">
                        LinkedIn
                      </a>
                    )}
                    {f.email && (
                      <a href={`mailto:${f.email}`} className="text-muted-foreground text-xs truncate max-w-[200px]">
                        {f.email}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Touchpoints */}
          <div className="mb-6 rounded-xl border bg-card p-4 shadow-sm">
            <TouchpointsSection dealflowEntryId={entryId} />
          </div>

          {/* Documents (read-only list with upload) */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h3 className="font-medium flex items-center gap-2">
                <FileText className="size-4" />
                Documents ({documents.length})
              </h3>
              <div className="flex gap-2">
                <input ref={fileInputRef} type="file" accept=".pdf,.pptx,.doc" className="hidden" onChange={handleUploadFile} />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-1 size-4" />
                  Upload file
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowDocLink((v) => !v)}>
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
                <li key={doc.id} className="flex items-center justify-between rounded-md border bg-background/50 px-3 py-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{doc.original_filename || doc.url || doc.type}</span>
                    <span className="text-muted-foreground text-xs">{doc.status}</span>
                  </div>
                  <div className="flex gap-1">
                    {doc.original_filename && (
                      <Button variant="ghost" size="sm" onClick={() => handleDownloadDoc(doc)}>Download</Button>
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
        </>
      )}

      {/* ─── EDIT MODE ─── */}
      {editing && (
        <>
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              <button type="button" onClick={() => logoInputRef.current?.click()} title="Click to change logo" className="shrink-0">
                <CompanyLogo name={entry.name} logoUrl={entry.logo_url} size="lg" />
              </button>
              <h1 className="font-display text-2xl font-semibold tracking-tight">{entry.name}</h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.replace(`/dealflow/${entryId}`, { scroll: false })}
            >
              <ArrowLeft className="mr-1.5 size-4" />
              Done
            </Button>
          </div>

          {/* Editable fields */}
          <div className="mb-10 rounded-xl border bg-card p-4 shadow-sm space-y-4">
            <h3 className="font-medium">Company details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="dealflow-name" className="text-muted-foreground text-xs font-medium">Name</label>
                <Input id="dealflow-name" defaultValue={entry.name} onBlur={(e) => e.target.value !== entry.name && save({ name: e.target.value })} className="mt-0.5" />
              </div>
              <div>
                <label htmlFor="dealflow-website" className="text-muted-foreground text-xs font-medium">Website</label>
                <Input id="dealflow-website" defaultValue={entry.website ?? ""} placeholder="https://…" onBlur={(e) => save({ website: e.target.value || undefined })} className="mt-0.5" />
              </div>
              <div>
                <label htmlFor="dealflow-company-linkedin" className="text-muted-foreground text-xs font-medium">Company LinkedIn</label>
                <Input id="dealflow-company-linkedin" defaultValue={entry.company_linkedin_url ?? ""} placeholder="https://linkedin.com/company/…" onBlur={(e) => save({ company_linkedin_url: e.target.value || undefined })} className="mt-0.5" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="dealflow-one-liner" className="text-muted-foreground text-xs font-medium">One-liner</label>
                <Input id="dealflow-one-liner" defaultValue={entry.one_liner ?? ""} onBlur={(e) => save({ one_liner: e.target.value || undefined })} className="mt-0.5" />
              </div>
              <div>
                <label htmlFor="dealflow-location" className="text-muted-foreground text-xs font-medium">Location</label>
                <div className="mt-0.5">
                  <LocationPicker
                    variant="field"
                    buttonId="dealflow-location"
                    locations={locations}
                    value={entry.location ?? ""}
                    onChange={(v) => {
                      void save({ location: v || undefined });
                    }}
                    onAdd={async (name) => {
                      const loc = await locationsApi.create(name);
                      setLocations((prev) => [...prev, loc].sort((a, b) => a.name.localeCompare(b.name)));
                      await save({ location: loc.name });
                    }}
                    className="[&_button]:max-w-none w-full max-w-md"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="dealflow-stage" className="text-muted-foreground text-xs font-medium">Stage</label>
                <select id="dealflow-stage" defaultValue={entry.stage ?? ""} onChange={(e) => save({ stage: e.target.value || undefined })} className="mt-0.5 w-full rounded-md border bg-background px-3 py-2 text-sm">
                  {STAGE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
              </div>
              <div>
                <label htmlFor="dealflow-amount-raising" className="text-muted-foreground text-xs font-medium">Amount raising ($)</label>
                <Input id="dealflow-amount-raising" type="number" defaultValue={entry.amount_raising ?? ""} onBlur={(e) => save({ amount_raising: e.target.value ? parseFloat(e.target.value) : undefined })} className="mt-0.5" />
              </div>
              <div>
                <label htmlFor="dealflow-valuation" className="text-muted-foreground text-xs font-medium">Valuation ($)</label>
                <Input id="dealflow-valuation" type="number" defaultValue={entry.valuation ?? ""} onBlur={(e) => save({ valuation: e.target.value ? parseFloat(e.target.value) : undefined })} className="mt-0.5" />
              </div>
              <div>
                <label htmlFor="dealflow-source" className="text-muted-foreground text-xs font-medium">Source</label>
                <select id="dealflow-source" defaultValue={entry.source_type ?? ""} onChange={(e) => save({ source_type: e.target.value || undefined })} className="mt-0.5 w-full rounded-md border bg-background px-3 py-2 text-sm">
                  {SOURCE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
              </div>
              <div>
                <label htmlFor="dealflow-source-detail" className="text-muted-foreground text-xs font-medium">Source detail</label>
                <Input id="dealflow-source-detail" defaultValue={entry.source_detail ?? ""} placeholder="e.g. Twitter @xyz" onBlur={(e) => save({ source_detail: e.target.value || undefined })} className="mt-0.5" />
              </div>
              <div>
                <label htmlFor="dealflow-status" className="text-muted-foreground text-xs font-medium">Status</label>
                <select id="dealflow-status" defaultValue={entry.status} onChange={(e) => save({ status: e.target.value })} className="mt-0.5 w-full rounded-md border bg-background px-3 py-2 text-sm">
                  {STATUS_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="dealflow-notes" className="text-muted-foreground text-xs font-medium">Notes</label>
                <textarea id="dealflow-notes" defaultValue={entry.notes ?? ""} onBlur={(e) => save({ notes: e.target.value || undefined })} rows={3} className="mt-0.5 w-full rounded-md border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            {saving && <p className="text-muted-foreground text-xs">Saving…</p>}
          </div>

          {/* Founders (editable) */}
          <div className="mb-10 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Founders</h3>
              <Button variant="outline" size="sm" onClick={() => setShowAddFounder((v) => !v)}>
                <Plus className="mr-1 size-4" />
                Add founder
              </Button>
            </div>
            {showAddFounder && (
              <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border p-3 bg-muted/30">
                <Input placeholder="Name *" value={newFounderName} onChange={(e) => setNewFounderName(e.target.value)} className="max-w-[180px]" />
                <Input placeholder="LinkedIn URL" value={newFounderLinkedIn} onChange={(e) => setNewFounderLinkedIn(e.target.value)} className="max-w-[200px]" />
                <Input placeholder="Twitter URL" value={newFounderTwitter} onChange={(e) => setNewFounderTwitter(e.target.value)} className="max-w-[200px]" />
                <Input placeholder="Email" value={newFounderEmail} onChange={(e) => setNewFounderEmail(e.target.value)} className="max-w-[200px]" />
                <Button size="sm" onClick={handleAddFounder} disabled={!newFounderName.trim()}>Add</Button>
                <Button variant="ghost" size="sm" onClick={() => setShowAddFounder(false)}>Cancel</Button>
              </div>
            )}
            {entry.founders.length === 0 && !showAddFounder && (
              <p className="text-muted-foreground text-sm">No founders added yet.</p>
            )}
            <div className="flex flex-wrap items-stretch gap-2">
              {entry.founders.map((f) => (
                <div
                  key={f.id}
                  className="inline-flex max-w-full items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm shadow-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{f.name}</span>
                    {(f.linkedin_url || f.twitter_url || f.email) && (
                      <div className="text-muted-foreground text-xs mt-0.5 truncate max-w-[240px]">
                        {[f.linkedin_url, f.twitter_url, f.email].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteFounder(f)}
                    className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Remove founder"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

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
