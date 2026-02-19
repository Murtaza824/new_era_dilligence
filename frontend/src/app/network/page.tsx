"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";

import { Check, FileUp, Plus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

export default function NetworkPage() {
  const { user, loading: authLoading } = useAuth();
  const [contacts, setContacts] = useState<NetworkContact[]>([]);
  const [suggestions, setSuggestions] = useState<IntroductionSuggestion[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  const [search, setSearch] = useState("");
  const [tagsFilter, setTagsFilter] = useState("");
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
  const csvInputRef = useRef<HTMLInputElement>(null);

  const loadContacts = useCallback(() => {
    setLoadingContacts(true);
    networkApi.contacts
      .list({
        ...(search.trim() && { q: search.trim() }),
        ...(tagsFilter.trim() && { tags: tagsFilter.trim() }),
      })
      .then(setContacts)
      .catch(() => toast.error("Failed to load contacts"))
      .finally(() => setLoadingContacts(false));
  }, [search, tagsFilter]);

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
    if (user && relationshipManagers.length > 0 && !selectedAddedBy) {
      setSelectedAddedBy(user.id);
    }
  }, [user, relationshipManagers, selectedAddedBy]);

  useEffect(() => {
    if (showAddContact && user?.id && relationshipManagers.some((r) => r.id === user.id)) {
      setSelectedAddedBy(user.id);
    }
  }, [showAddContact, user?.id, relationshipManagers]);

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
        toast.success(`Imported ${result.imported}, skipped ${result.skipped}. Some rows had errors.`, { description: result.errors.slice(0, 3).join("; ") });
      } else {
        toast.success(`Imported ${result.imported} contact(s)${result.skipped ? `, skipped ${result.skipped}` : ""}.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
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
    <div className="container mx-auto max-w-6xl px-6 pt-10 pb-20">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Network
        </h1>
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
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search all columns…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Input
              placeholder="Filter by tags (e.g. lp, operator)"
              value={tagsFilter}
              onChange={(e) => setTagsFilter(e.target.value)}
              className="max-w-xs"
            />
            <Button
              size="sm"
              onClick={() => setShowAddContact((v) => !v)}
            >
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

          {showAddContact && (
            <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
              <h3 className="font-medium flex items-center gap-2">
                <UserPlus className="size-4" />
                New contact
              </h3>
              <p className="text-muted-foreground text-sm">Only name is required; all other fields are optional.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  placeholder="Name (required)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                {relationshipManagers.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="new-contact-relationship-manager" className="text-muted-foreground text-xs font-medium">Relationship manager</label>
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
                <Input
                  placeholder="Email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
                <Input
                  placeholder="Company"
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                />
                <Input
                  placeholder="Role / title"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                />
                <Input
                  placeholder="LinkedIn URL"
                  value={newLinkedIn}
                  onChange={(e) => setNewLinkedIn(e.target.value)}
                />
                <Input
                  placeholder="Phone"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
                <Input
                  placeholder="Location"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                />
                <Input
                  placeholder="Skills (comma-separated)"
                  value={newSkills}
                  onChange={(e) => setNewSkills(e.target.value)}
                />
                <Input
                  placeholder="Notes"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
                <Input
                  placeholder="Tags (e.g. lp, angel, operator)"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="sm:col-span-2"
                />
                <div className="sm:col-span-2 flex flex-wrap items-center gap-6">
                  <label htmlFor="new-contact-nev-fund-lp" className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      id="new-contact-nev-fund-lp"
                      checked={newNevFundILp}
                      onCheckedChange={(v) => setNewNevFundILp(v === true)}
                    />
                    NEV Fund I LP
                  </label>
                  <label htmlFor="new-contact-nev-syndicate-lp" className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      id="new-contact-nev-syndicate-lp"
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

          {loadingContacts ? (
            <p className="text-muted-foreground">Loading contacts…</p>
          ) : contacts.length === 0 ? (
            <p className="text-muted-foreground">No contacts yet. Add one above.</p>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              <ul className="divide-y">
                {contacts.map((c) => (
                  <li key={c.id} className="p-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">{c.name}</span>
                      {(c.company_name || c.role_or_title) && (
                        <span className="text-muted-foreground text-sm ml-2">
                          {[c.role_or_title, c.company_name].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      <p className="text-muted-foreground text-xs mt-0.5 flex flex-wrap gap-x-3 gap-y-0 items-center">
                        {relationshipManagers.length > 0 && (() => {
                          const label = relationshipManagerLabel(
                            relationshipManagers.find((r) => r.id === c.added_by_user_id)?.email ?? ""
                          );
                          return label ? <span>Relationship manager: {label}</span> : null;
                        })()}
                        {(c.nev_fund_i_lp || c.nev_syndicate_lp) && (
                          <span>
                            LP: {[c.nev_fund_i_lp && "NEV Fund I", c.nev_syndicate_lp && "NEV Syndicate"].filter(Boolean).join(", ")}
                          </span>
                        )}
                        {c.phone_number && <span>Phone: {c.phone_number}</span>}
                        {c.location && <span>Location: {c.location}</span>}
                        {c.skills && <span>Skills: {c.skills}</span>}
                        {c.tags && <span>Tags: {c.tags}</span>}
                        {c.notes && <span>Notes: {c.notes.slice(0, 60)}{c.notes.length > 60 ? "…" : ""}</span>}
                        {c.linkedin_url && (
                          <a
                            href={c.linkedin_url.startsWith("http") ? c.linkedin_url : `https://${c.linkedin_url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            LinkedIn
                          </a>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        )}

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
                              href={`/companies/${s.target_company_id}`}
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
                            <span>{s.target_company_name ?? s.target_portfolio_name ?? "—"}</span>
                          )}
                        </p>
                        <p className="text-muted-foreground text-sm mt-0.5">
                          {introTypeLabel(s.introduction_type)}
                          {s.reason_summary && ` · ${s.reason_summary}`}
                        </p>
                        <span className="text-muted-foreground text-xs">
                          {s.status}
                          {s.created_by_trigger && ` · ${s.created_by_trigger.replace(/_/g, " ")}`}
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
    </div>
  );
}
