"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Check,
  ExternalLink,
  FileUp,
  Linkedin,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { networkApi, type RelationshipManager } from "@/lib/api";
import type { IntroductionSuggestion, NetworkContact } from "@/types";

function introTypeLabel(t: string): string {
  switch (t) {
    case "fundraising":
      return "Fundraising";
    case "customer_sales":
      return "Customer / Sales";
    case "partnership":
      return "Partnership";
    default:
      return t || "Other";
  }
}

function relationshipManagerLabel(email: string): string {
  const lower = email.toLowerCase();
  if (lower.includes("murtaza")) return "Murtaza";
  if (lower.includes("carter")) return "Carter";
  return email.split("@")[0] || email;
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function NetworkPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [contacts, setContacts] = useState<NetworkContact[]>([]);
  const [suggestions, setSuggestions] = useState<IntroductionSuggestion[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [rmFilter, setRmFilter] = useState("");
  const [lpFilter, setLpFilter] = useState("");
  const [warmFilter, setWarmFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("suggested");

  const [showAddContact, setShowAddContact] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newLinkedIn, setNewLinkedIn] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newSkills, setNewSkills] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newNevFundILp, setNewNevFundILp] = useState(false);
  const [newNevSyndicateLp, setNewNevSyndicateLp] = useState(false);
  const [relationshipManagers, setRelationshipManagers] = useState<RelationshipManager[]>([]);
  const [selectedAddedBy, setSelectedAddedBy] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"contacts" | "introductions">("contacts");
  const [deleteTarget, setDeleteTarget] = useState<NetworkContact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const loadContacts = useCallback(() => {
    setLoadingContacts(true);
    networkApi.contacts
      .list({
        ...(search.trim() && { q: search.trim() }),
      })
      .then(setContacts)
      .catch(() => toast.error("Failed to load contacts"))
      .finally(() => setLoadingContacts(false));
  }, [search]);

  const loadSuggestions = useCallback(() => {
    setLoadingSuggestions(true);
    networkApi.suggestions
      .list({
        ...(statusFilter && { status: statusFilter }),
      })
      .then(setSuggestions)
      .catch(() => toast.error("Failed to load suggestions"))
      .finally(() => setLoadingSuggestions(false));
  }, [statusFilter]);

  useEffect(() => {
    if (!authLoading && user) {
      loadContacts();
      loadSuggestions();
      networkApi.getRelationshipManagers().then(setRelationshipManagers).catch(() => {});
    } else if (!authLoading && !user) {
      setLoadingContacts(false);
      setLoadingSuggestions(false);
    }
  }, [authLoading, user, loadContacts, loadSuggestions]);

  useEffect(() => {
    if (showAddContact && user?.id && relationshipManagers.some((r) => r.id === user.id)) {
      setSelectedAddedBy(user.id);
    }
  }, [showAddContact, user?.id, relationshipManagers]);

  // Derive distinct roles for the filter dropdown
  const distinctRoles = Array.from(
    new Set(
      contacts
        .map((c) => c.role_or_title)
        .filter(Boolean) as string[]
    )
  ).sort();

  // Apply client-side filters
  const filteredContacts = contacts.filter((c) => {
    if (roleFilter && c.role_or_title !== roleFilter) return false;
    if (rmFilter && c.added_by_user_id !== rmFilter) return false;
    if (lpFilter === "fund_i" && !c.nev_fund_i_lp) return false;
    if (lpFilter === "syndicate" && !c.nev_syndicate_lp) return false;
    if (lpFilter === "interested" && !c.interested_lp) return false;
    if (warmFilter && !c.warm) return false;
    return true;
  });

  const handleAddContact = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await networkApi.contacts.create({
        name: newName.trim(),
        ...(newEmail.trim() && { email: newEmail.trim() }),
        ...(newPhone.trim() && { phone_number: newPhone.trim() }),
        ...(newLocation.trim() && { location: newLocation.trim() }),
        ...(newCompany.trim() && { company_name: newCompany.trim() }),
        ...(newRole.trim() && { role_or_title: newRole.trim() }),
        ...(newLinkedIn.trim() && { linkedin_url: newLinkedIn.trim() }),
        ...(newSkills.trim() && { skills: newSkills.trim() }),
        ...(newNotes.trim() && { notes: newNotes.trim() }),
        ...(newTags.trim() && { tags: newTags.trim() }),
        nev_fund_i_lp: newNevFundILp,
        nev_syndicate_lp: newNevSyndicateLp,
        ...(selectedAddedBy && { added_by_user_id: selectedAddedBy }),
      });
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewLocation("");
      setNewCompany("");
      setNewRole("");
      setNewLinkedIn("");
      setNewSkills("");
      setNewNotes("");
      setNewTags("");
      setNewNevFundILp(false);
      setNewNevSyndicateLp(false);
      setShowAddContact(false);
      loadContacts();
      loadSuggestions();
      toast.success("Contact added; new intros may appear below.");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Failed to add contact";
      const message =
        raw === "Not Found" || raw.includes("404")
          ? "Network API not found. Redeploy your backend with the latest code and set NEXT_PUBLIC_API_URL to the backend URL."
          : raw;
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      const result = await networkApi.contacts.importCsv(file);
      loadContacts();
      loadSuggestions();
      if (result.errors.length > 0) {
        toast.success(
          `Imported ${result.imported}, skipped ${result.skipped}. Some rows had errors.`,
          { description: result.errors.slice(0, 3).join("; ") }
        );
      } else {
        toast.success(
          `Imported ${result.imported} contact(s)${result.skipped ? `, skipped ${result.skipped}` : ""}.`
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await networkApi.contacts.delete(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" removed`);
      setDeleteTarget(null);
      loadContacts();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const handleSuggestionStatus = async (id: string, status: "introduced" | "dismissed") => {
    try {
      await networkApi.suggestions.updateStatus(id, status);
      loadSuggestions();
      toast.success(status === "introduced" ? "Marked as introduced" : "Dismissed");
    } catch {
      toast.error("Failed to update");
    }
  };

  return (
    <div className="container mx-auto max-w-7xl px-6 pt-10 pb-20">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Network</h1>
        <p className="text-muted-foreground mt-1">
          Combined network and introduction suggestions.
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex gap-1 border-b">
          <button
            type="button"
            onClick={() => setActiveTab("contacts")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "contacts"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Contacts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("introductions")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "introductions"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Introductions
          </button>
        </div>

        {activeTab === "contacts" && (
          <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  placeholder="Search all columns…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">All roles</option>
                {distinctRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                value={rmFilter}
                onChange={(e) => setRmFilter(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">All RMs</option>
                {relationshipManagers.map((rm) => (
                  <option key={rm.id} value={rm.id}>
                    {relationshipManagerLabel(rm.email)}
                  </option>
                ))}
              </select>
              <select
                value={lpFilter}
                onChange={(e) => setLpFilter(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">All LP status</option>
                <option value="fund_i">NEV Fund I LP</option>
                <option value="syndicate">Syndicate</option>
                <option value="interested">Interested LP</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                <Checkbox
                  checked={warmFilter}
                  onCheckedChange={(v) => setWarmFilter(v === true)}
                />
                Warm
              </label>
              <Button size="sm" onClick={() => setShowAddContact((v) => !v)}>
                <Plus className="mr-1.5 size-4" />
                Add contact
              </Button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvImport}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={importing}
                onClick={() => csvInputRef.current?.click()}
              >
                <FileUp className="mr-1.5 size-4" />
                {importing ? "Importing…" : "Import CSV"}
              </Button>
            </div>

            {/* Add contact form */}
            {showAddContact && (
              <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  <UserPlus className="size-4" />
                  New contact
                </h3>
                <p className="text-muted-foreground text-sm">
                  Only name is required; all other fields are optional.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    placeholder="Name (required)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  {relationshipManagers.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="new-contact-relationship-manager"
                        className="text-muted-foreground text-xs font-medium"
                      >
                        Relationship manager
                      </label>
                      <select
                        id="new-contact-relationship-manager"
                        value={selectedAddedBy}
                        onChange={(e) => setSelectedAddedBy(e.target.value)}
                        className="rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        {relationshipManagers.map((r) => (
                          <option key={r.id} value={r.id}>
                            {relationshipManagerLabel(r.email)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <Input placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  <Input placeholder="Company" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} />
                  <Input placeholder="Role / title" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
                  <Input placeholder="LinkedIn URL" value={newLinkedIn} onChange={(e) => setNewLinkedIn(e.target.value)} />
                  <Input placeholder="Phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                  <Input placeholder="Location" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} />
                  <Input placeholder="Skills (comma-separated)" value={newSkills} onChange={(e) => setNewSkills(e.target.value)} />
                  <Input placeholder="Notes" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
                  <Input
                    placeholder="Tags (e.g. lp, angel, operator)"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    className="sm:col-span-2"
                  />
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-6">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={newNevFundILp}
                        onCheckedChange={(v) => setNewNevFundILp(v === true)}
                      />
                      NEV Fund I LP
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={newNevSyndicateLp}
                        onCheckedChange={(v) => setNewNevSyndicateLp(v === true)}
                      />
                      NEV Syndicate LP
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddContact} disabled={creating || !newName.trim()}>
                    {creating ? "Adding…" : "Add"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddContact(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Contacts table */}
            {loadingContacts ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg border bg-card" />
                ))}
              </div>
            ) : filteredContacts.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center">
                {contacts.length === 0
                  ? "No contacts yet. Add one above."
                  : "No contacts match the current filters."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Name</th>
                      <th className="text-left p-3 font-medium">Role</th>
                      <th className="text-left p-3 font-medium">Company</th>
                      <th className="text-left p-3 font-medium">Location</th>
                      <th className="text-left p-3 font-medium">RM</th>
                      <th className="text-left p-3 font-medium">Tags / Flags</th>
                      <th className="text-center p-3 font-medium">Intros</th>
                      <th className="w-10 p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.map((c) => {
                      const rmLabel =
                        relationshipManagers.length > 0
                          ? relationshipManagerLabel(
                              relationshipManagers.find((r) => r.id === c.added_by_user_id)?.email ?? ""
                            )
                          : null;
                      const linkedinHref = c.linkedin_url
                        ? c.linkedin_url.startsWith("http")
                          ? c.linkedin_url
                          : `https://${c.linkedin_url}`
                        : null;

                      const flags: string[] = [];
                      if (c.nev_fund_i_lp) flags.push("Fund I LP");
                      if (c.syndicate_member) flags.push("Syndicate");
                      if (c.interested_lp) flags.push("Interested LP");
                      if (c.warm) flags.push("Warm");

                      return (
                        <tr
                          key={c.id}
                          className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors group"
                          onClick={() => router.push(`/network/${c.id}`)}
                        >
                          <td className="p-2">
                            <div className="flex items-center gap-2.5">
                              {c.profile_pic_url ? (
                                <img
                                  src={c.profile_pic_url}
                                  alt=""
                                  className="size-8 rounded-full object-cover shrink-0"
                                />
                              ) : (
                                <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary shrink-0">
                                  {initialsFromName(c.name)}
                                </span>
                              )}
                              <div className="min-w-0">
                                <span className="font-medium text-foreground truncate block">
                                  {c.name}
                                </span>
                              </div>
                              <Link
                                href={`/network/${c.id}`}
                                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-all"
                                title="Open profile"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="size-3.5" />
                              </Link>
                            </div>
                          </td>
                          <td className="p-2 max-w-[180px]">
                            <span className="text-muted-foreground truncate block" title={c.role_or_title ?? undefined}>
                              {c.role_or_title || "—"}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className="text-muted-foreground truncate block" title={c.company_name ?? undefined}>
                              {c.company_name || "—"}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className="text-muted-foreground truncate block">
                              {c.location || "—"}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className="text-muted-foreground">{rmLabel || "—"}</span>
                          </td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1">
                              {flags.map((f) => (
                                <span
                                  key={f}
                                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                    f === "Warm"
                                      ? "bg-orange-500/15 text-orange-700 dark:text-orange-400"
                                      : f === "Fund I LP"
                                        ? "bg-green-500/15 text-green-700 dark:text-green-400"
                                        : f === "Syndicate"
                                          ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                                          : "bg-purple-500/15 text-purple-700 dark:text-purple-400"
                                  }`}
                                >
                                  {f}
                                </span>
                              ))}
                              {flags.length === 0 && (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {c.intros_made_for_us} / {c.intros_we_made}
                            </span>
                          </td>
                          <td className="p-2">
                            <div
                              className="flex items-center justify-end gap-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {linkedinHref && (
                                <a
                                  href={linkedinHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                  title="LinkedIn"
                                >
                                  <Linkedin className="size-4" />
                                </a>
                              )}
                              {c.email && (
                                <a
                                  href={`mailto:${c.email}`}
                                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                  title={`Email ${c.email}`}
                                >
                                  <Mail className="size-4" />
                                </a>
                              )}
                              {c.phone_number && (
                                <a
                                  href={`tel:${c.phone_number}`}
                                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                  title={`Call ${c.phone_number}`}
                                >
                                  <Phone className="size-4" />
                                </a>
                              )}
                              <button
                                type="button"
                                className="rounded p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                                title="Delete"
                                onClick={() => setDeleteTarget(c)}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-muted-foreground text-xs text-right">
              {filteredContacts.length} of {contacts.length} contacts
            </p>
          </div>
        )}

        {/* Introductions tab */}
        {activeTab === "introductions" && (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              >
                <option value="suggested">Suggested</option>
                <option value="introduced">Introduced</option>
                <option value="dismissed">Dismissed</option>
                <option value="">All</option>
              </select>
            </div>

            {loadingSuggestions ? (
              <p className="text-muted-foreground">Loading suggestions…</p>
            ) : suggestions.length === 0 ? (
              <p className="text-muted-foreground">
                No introduction suggestions. Add contacts, companies, or portfolio entries to get suggestions.
              </p>
            ) : (
              <div className="rounded-xl border bg-card overflow-hidden">
                <ul className="divide-y">
                  {suggestions.map((s) => (
                    <li key={s.id} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            Introduce{" "}
                            <span className="text-foreground">{s.contact_name ?? "—"}</span>
                            {" to "}
                            {s.target_type === "company" && s.target_company_id ? (
                              <Link
                                href={`/dealroom/${s.target_company_id}`}
                                className="text-primary hover:underline"
                              >
                                {s.target_company_name ?? "Company"}
                              </Link>
                            ) : s.target_type === "portfolio" && s.target_portfolio_id ? (
                              <Link
                                href={`/portfolio/${s.target_portfolio_id}`}
                                className="text-primary hover:underline"
                              >
                                {s.target_portfolio_name ?? "Portfolio"}
                              </Link>
                            ) : (
                              <span>
                                {s.target_company_name ?? s.target_portfolio_name ?? "—"}
                              </span>
                            )}
                          </p>
                          <p className="text-muted-foreground text-sm mt-0.5">
                            {introTypeLabel(s.introduction_type)}
                            {s.reason_summary && ` · ${s.reason_summary}`}
                          </p>
                          <span className="text-muted-foreground text-xs">
                            {s.status}
                            {s.created_by_trigger &&
                              ` · ${s.created_by_trigger.replace(/_/g, " ")}`}
                          </span>
                        </div>
                        {s.status === "suggested" && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSuggestionStatus(s.id, "introduced")}
                            >
                              <Check className="mr-1 size-3.5" />
                              Introduced
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSuggestionStatus(s.id, "dismissed")}
                            >
                              <X className="mr-1 size-3.5" />
                              Dismiss
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This contact will be permanently removed. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
