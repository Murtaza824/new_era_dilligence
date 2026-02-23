"use client";

/* eslint-disable jsx-a11y/no-autofocus */
import { useCallback, useEffect, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import {
  ArrowLeft,
  Check,
  Linkedin,
  Mail,
  Phone,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { networkApi, type RelationshipManager } from "@/lib/api";
import type { IntroductionSuggestion, NetworkContact } from "@/types";

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

type EditingField = string | null;

export default function NetworkContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;
  const { user, loading: authLoading } = useAuth();

  const [contact, setContact] = useState<NetworkContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EditingField>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rms, setRms] = useState<RelationshipManager[]>([]);
  const [contactSuggestions, setContactSuggestions] = useState<IntroductionSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const loadContact = useCallback(() => {
    networkApi.contacts
      .get(contactId)
      .then((c) => {
        setContact(c);
        setLoading(false);
      })
      .catch(() => {
        router.push("/network");
      });
  }, [contactId, router]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/network");
      return;
    }
    if (!authLoading && user) {
      loadContact();
      networkApi.getRelationshipManagers().then(setRms).catch(() => {});
    }
  }, [authLoading, user, loadContact, router]);

  const loadContactSuggestions = useCallback(() => {
    setLoadingSuggestions(true);
    networkApi.suggestions
      .list({ contact_id: contactId })
      .then(setContactSuggestions)
      .catch(() => setContactSuggestions([]))
      .finally(() => setLoadingSuggestions(false));
  }, [contactId]);

  useEffect(() => {
    if (contactId && user) loadContactSuggestions();
  }, [contactId, user, loadContactSuggestions]);

  // Scroll to intro-suggestions when hash is present
  useEffect(() => {
    if (typeof window === "undefined" || !contact) return;
    if (window.location.hash === "#intro-suggestions") {
      document.getElementById("intro-suggestions")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [contact]);

  const handleSuggestionStatus = async (id: string, status: "introduced" | "dismissed") => {
    try {
      const updated = await networkApi.suggestions.updateStatus(id, status);
      setContactSuggestions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      toast.success(status === "introduced" ? "Marked as introduced" : "Dismissed");
    } catch {
      toast.error("Failed to update");
    }
  };

  const save = async (field: string, value: unknown) => {
    setEditing(null);
    if (!contact) return;
    setSaving(true);
    try {
      const updated = await networkApi.contacts.update(contact.id, { [field]: value ?? null } as Record<string, unknown>);
      setContact(updated);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!contact) return;
    setDeleting(true);
    try {
      await networkApi.contacts.delete(contact.id);
      toast.success(`"${contact.name}" deleted`);
      router.push("/network");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  if (loading || !contact) {
    return (
      <div className="container mx-auto max-w-4xl px-6 pt-10">
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-64 animate-pulse rounded-xl border bg-card" />
        </div>
      </div>
    );
  }

  const rmEmail = rms.find((r) => r.id === contact.added_by_user_id)?.email;
  const rmLabel = rmEmail ? relationshipManagerLabel(rmEmail) : "—";
  const linkedinHref = contact.linkedin_url
    ? contact.linkedin_url.startsWith("http")
      ? contact.linkedin_url
      : `https://${contact.linkedin_url}`
    : null;

  const isEditing = (field: string) => editing === field;

  const skillsList = contact.skills
    ? contact.skills.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="container mx-auto max-w-4xl px-6 pt-10 pb-20">
      {/* Back link */}
      <Link
        href="/network"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Network
      </Link>

      {saving && (
        <p className="text-muted-foreground text-sm mb-2">Saving…</p>
      )}

      {/* Profile header */}
      <div className="rounded-xl border bg-card p-6 mb-6">
        <div className="flex items-start gap-5">
          {contact.profile_pic_url ? (
            <Image
              src={contact.profile_pic_url}
              alt=""
              width={80}
              height={80}
              className="size-20 rounded-full object-cover shrink-0"
              unoptimized
            />
          ) : (
            <span className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-semibold text-primary shrink-0">
              {initialsFromName(contact.name)}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                {isEditing("name") ? (
                  <Input
                    className="text-2xl font-semibold h-auto py-1"
                    defaultValue={contact.name}
                    autoFocus
                    onBlur={(e) => save("name", e.target.value.trim() || contact.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <h1
                    className="font-display text-2xl font-semibold tracking-tight cursor-text hover:bg-muted/50 rounded px-1 -mx-1"
                    onClick={() => setEditing("name")}
                  >
                    {contact.name}
                  </h1>
                )}
                <p className="text-muted-foreground mt-0.5">
                  {[contact.role_or_title, contact.company_name].filter(Boolean).join(" · ") || "No role / company"}
                </p>
                {contact.location && (
                  <p className="text-muted-foreground text-sm mt-0.5">{contact.location}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {linkedinHref && (
                  <a
                    href={linkedinHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="LinkedIn"
                  >
                    <Linkedin className="size-5" />
                  </a>
                )}
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title={contact.email}
                  >
                    <Mail className="size-5" />
                  </a>
                )}
                {contact.phone_number && (
                  <a
                    href={`tel:${contact.phone_number}`}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title={contact.phone_number}
                  >
                    <Phone className="size-5" />
                  </a>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDeleteModal(true)}
                >
                  <Trash2 className="size-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Overview */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-lg">Overview</h2>
          <div className="space-y-3">
            <EditableField
              label="Role / Title"
              field="role_or_title"
              value={contact.role_or_title}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
            <EditableField
              label="Company"
              field="company_name"
              value={contact.company_name}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
            <EditableField
              label="Location"
              field="location"
              value={contact.location}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
            <EditableField
              label="Stage"
              field="stage"
              value={contact.stage}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
            <EditableField
              label="VC Firm"
              field="vc_firm_name"
              value={contact.vc_firm_name}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
            <EditableField
              label="Startup Name"
              field="startup_name"
              value={contact.startup_name}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
            <EditableField
              label="Email"
              field="email"
              value={contact.email}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
            <EditableField
              label="Phone"
              field="phone_number"
              value={contact.phone_number}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
            <EditableField
              label="LinkedIn"
              field="linkedin_url"
              value={contact.linkedin_url}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
            <div>
              <span className="text-xs text-muted-foreground font-medium">Skills</span>
              {isEditing("skills") ? (
                <Input
                  className="mt-1"
                  defaultValue={contact.skills ?? ""}
                  placeholder="Comma-separated skills"
                  autoFocus
                  onBlur={(e) => save("skills", e.target.value.trim() || null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <div
                  className="mt-1 flex flex-wrap gap-1 min-h-[28px] cursor-text hover:bg-muted/50 rounded px-1 -mx-1 py-0.5"
                  onClick={() => setEditing("skills")}
                >
                  {skillsList.length > 0
                    ? skillsList.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs"
                        >
                          {s}
                        </span>
                      ))
                    : <span className="text-sm text-muted-foreground">—</span>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Warm</span>
              <StatusBadge
                active={contact.warm}
                label={contact.warm ? "Yes" : "No"}
                color={contact.warm ? "orange" : "gray"}
                onClick={() => save("warm", !contact.warm)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">RM</span>
              <span className="text-sm">{rmLabel}</span>
            </div>
          </div>
        </div>

        {/* LP & Investment */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-lg">LP & Investment</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">NEV Fund I LP</span>
              <StatusBadge
                active={contact.nev_fund_i_lp}
                label={contact.nev_fund_i_lp ? "Yes" : "No"}
                color={contact.nev_fund_i_lp ? "green" : "gray"}
                onClick={() => save("nev_fund_i_lp", !contact.nev_fund_i_lp)}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">NEV Syndicate LP</span>
              <StatusBadge
                active={contact.nev_syndicate_lp}
                label={contact.nev_syndicate_lp ? "Yes" : "No"}
                color={contact.nev_syndicate_lp ? "blue" : "gray"}
                onClick={() => save("nev_syndicate_lp", !contact.nev_syndicate_lp)}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Syndicate Member</span>
              <StatusBadge
                active={contact.syndicate_member}
                label={contact.syndicate_member ? "Yes" : "No"}
                color={contact.syndicate_member ? "blue" : "gray"}
                onClick={() => save("syndicate_member", !contact.syndicate_member)}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Interested LP</span>
              <StatusBadge
                active={contact.interested_lp}
                label={contact.interested_lp ? "Yes" : "No"}
                color={contact.interested_lp ? "purple" : "gray"}
                onClick={() => save("interested_lp", !contact.interested_lp)}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Quarterly Update List</span>
              <StatusBadge
                active={contact.quarterly_update_list}
                label={contact.quarterly_update_list ? "Yes" : "No"}
                color={contact.quarterly_update_list ? "green" : "gray"}
                onClick={() => save("quarterly_update_list", !contact.quarterly_update_list)}
              />
            </div>
            <EditableField
              label="Investor Check Size"
              field="investor_check_size"
              value={contact.investor_check_size}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
            <EditableField
              label="Check Sizes"
              field="check_sizes"
              value={contact.check_sizes}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
            <EditableField
              label="Investor In"
              field="investor_in"
              value={contact.investor_in}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
          </div>
        </div>

        {/* Introductions */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-lg">Introductions</h2>
          <div className="space-y-3">
            <EditableField
              label="Introductions Made"
              field="introductions_made"
              value={contact.introductions_made}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
            <EditableField
              label="Introduced Us To (Pipeline)"
              field="introduced_us_to"
              value={contact.introduced_us_to}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground font-medium">Intros for us</span>
                {isEditing("intros_made_for_us") ? (
                  <Input
                    type="number"
                    className="mt-1 h-8"
                    defaultValue={contact.intros_made_for_us}
                    autoFocus
                    onBlur={(e) =>
                      save("intros_made_for_us", parseInt(e.target.value) || 0)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <p
                    className="text-sm mt-1 cursor-text hover:bg-muted/50 rounded px-1 -mx-1 py-0.5"
                    onClick={() => setEditing("intros_made_for_us")}
                  >
                    {contact.intros_made_for_us}
                  </p>
                )}
              </div>
              <div>
                <span className="text-xs text-muted-foreground font-medium">Intros we made</span>
                {isEditing("intros_we_made") ? (
                  <Input
                    type="number"
                    className="mt-1 h-8"
                    defaultValue={contact.intros_we_made}
                    autoFocus
                    onBlur={(e) =>
                      save("intros_we_made", parseInt(e.target.value) || 0)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <p
                    className="text-sm mt-1 cursor-text hover:bg-muted/50 rounded px-1 -mx-1 py-0.5"
                    onClick={() => setEditing("intros_we_made")}
                  >
                    {contact.intros_we_made}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Suggested introductions (from agent) */}
        <div id="intro-suggestions" className="md:col-span-2 rounded-xl border bg-card p-5 space-y-4 scroll-mt-6">
          <h2 className="font-semibold text-lg">Suggested introductions</h2>
          <p className="text-muted-foreground text-sm">
            Intros the agent suggests for this contact — to companies in Active Deals, portfolio, or dealflow.
          </p>
          {loadingSuggestions ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : contactSuggestions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No suggested introductions for this contact.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border">
              {contactSuggestions.map((s) => (
                <li key={s.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">
                        Introduce {contact.name} to{" "}
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
                        ) : s.target_type === "dealflow" && s.target_dealflow_entry_id ? (
                          <Link
                            href={`/dealflow/${s.target_dealflow_entry_id}`}
                            className="text-primary hover:underline"
                          >
                            {s.target_dealflow_entry_name ?? "Dealflow"}
                          </Link>
                        ) : (
                          <span>
                            {s.target_company_name ??
                              s.target_portfolio_name ??
                              s.target_dealflow_entry_name ??
                              "—"}
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {introTypeLabel(s.introduction_type)}
                        {s.reason_summary && ` · ${s.reason_summary}`}
                      </p>
                      <span className="text-muted-foreground text-xs">
                        {s.status}
                        {s.created_by_trigger && ` · ${s.created_by_trigger.replace(/_/g, " ")}`}
                      </span>
                    </div>
                    {s.status === "suggested" && (
                      <div className="flex gap-1 shrink-0">
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
          )}
        </div>

        {/* Related Companies */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-lg">Related Companies</h2>
          <EditableField
            label="Related Companies (Previous)"
            field="related_companies"
            value={contact.related_companies}
            editing={editing}
            setEditing={setEditing}
            onSave={save}
          />
        </div>

        {/* Notes */}
        <div className="md:col-span-2 rounded-xl border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-lg">Notes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-muted-foreground font-medium">Notes</span>
              {isEditing("notes") ? (
                <textarea
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-ring"
                  defaultValue={contact.notes ?? ""}
                  autoFocus
                  onBlur={(e) => save("notes", e.target.value.trim() || null)}
                />
              ) : (
                <p
                  className="text-sm mt-1 whitespace-pre-wrap cursor-text hover:bg-muted/50 rounded px-1 -mx-1 py-1 min-h-[60px]"
                  onClick={() => setEditing("notes")}
                >
                  {contact.notes || <span className="text-muted-foreground">Click to add notes…</span>}
                </p>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground font-medium">Notes 2</span>
              {isEditing("notes_2") ? (
                <textarea
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-ring"
                  defaultValue={contact.notes_2 ?? ""}
                  autoFocus
                  onBlur={(e) => save("notes_2", e.target.value.trim() || null)}
                />
              ) : (
                <p
                  className="text-sm mt-1 whitespace-pre-wrap cursor-text hover:bg-muted/50 rounded px-1 -mx-1 py-1 min-h-[60px]"
                  onClick={() => setEditing("notes_2")}
                >
                  {contact.notes_2 || <span className="text-muted-foreground">Click to add notes…</span>}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title={`Delete "${contact.name}"?`}
        description="This contact will be permanently removed. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

/* ── Reusable inline-editable field ─────────────────────────────────────── */

function EditableField({
  label,
  field,
  value,
  editing,
  setEditing,
  onSave,
}: {
  label: string;
  field: string;
  value: string | null | undefined;
  editing: EditingField;
  setEditing: (f: EditingField) => void;
  onSave: (field: string, value: unknown) => void;
}) {
  const isActive = editing === field;
  return (
    <div>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      {isActive ? (
        <Input
          className="mt-1"
          defaultValue={value ?? ""}
          autoFocus
          onBlur={(e) => onSave(field, e.target.value.trim() || null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(null);
          }}
        />
      ) : (
        <p
          className="text-sm mt-1 cursor-text hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 truncate"
          onClick={() => setEditing(field)}
          title={value ?? undefined}
        >
          {value || <span className="text-muted-foreground">—</span>}
        </p>
      )}
    </div>
  );
}

/* ── Toggleable status badge ────────────────────────────────────────────── */

function StatusBadge({
  label,
  color,
  onClick,
}: {
  active?: boolean;
  label: string;
  color: "green" | "blue" | "purple" | "orange" | "gray";
  onClick: () => void;
}) {
  const colorMap: Record<string, string> = {
    green: "bg-green-500/15 text-green-700 dark:text-green-400",
    blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    purple: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
    orange: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
    gray: "bg-muted text-muted-foreground",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors hover:ring-1 hover:ring-muted-foreground/30 ${colorMap[color]}`}
    >
      {label}
    </button>
  );
}
