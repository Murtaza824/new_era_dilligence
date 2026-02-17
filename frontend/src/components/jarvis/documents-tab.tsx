"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Upload,
  FileText,
  Globe,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { documents as docsApi } from "@/lib/api";
import type { Document } from "@/types";

interface Props {
  companyId: string;
  onDocumentsChanged?: () => void;
}

export function DocumentsTab({ companyId, onDocumentsChanged }: Props) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadMode, setUploadMode] = useState<
    "none" | "file" | "notes" | "website"
  >("none");
  const [uploading, setUploading] = useState(false);

  // Form state
  const [notesText, setNotesText] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    docsApi
      .list(companyId)
      .then(setDocs)
      .catch(() => toast.error("Failed to load documents"))
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await docsApi.uploadFile(companyId, file);
      setUploadMode("none");
      load();
      onDocumentsChanged?.();
      toast.success("File uploaded successfully");
    } catch {
      toast.error("Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleNotesSubmit = async () => {
    if (!notesText.trim()) return;
    setUploading(true);
    try {
      await docsApi.uploadJson(companyId, {
        type: "call_notes",
        content: notesText,
      });
      setNotesText("");
      setUploadMode("none");
      load();
      onDocumentsChanged?.();
      toast.success("Call notes saved");
    } catch {
      toast.error("Failed to save call notes");
    } finally {
      setUploading(false);
    }
  };

  const handleWebsiteSubmit = async () => {
    if (!websiteUrl.trim()) return;
    setUploading(true);
    try {
      await docsApi.uploadJson(companyId, {
        type: "website",
        url: websiteUrl,
      });
      setWebsiteUrl("");
      setUploadMode("none");
      load();
      onDocumentsChanged?.();
      toast.success("Website added");
    } catch {
      toast.error("Failed to add website");
    } finally {
      setUploading(false);
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "deck":
        return <FileText className="size-4" />;
      case "website":
        return <Globe className="size-4" />;
      case "call_notes":
        return <MessageSquare className="size-4" />;
      default:
        return <FileText className="size-4" />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "ready":
        return (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle className="size-3" /> Ready
          </span>
        );
      case "processing":
        return (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <Loader2 className="size-3 animate-spin" /> Processing
          </span>
        );
      case "error":
        return (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="size-3" /> Error
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      {/* Upload buttons */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setUploadMode(uploadMode === "file" ? "none" : "file")}
        >
          <Upload className="mr-1.5 size-4" />
          Upload Deck
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setUploadMode(uploadMode === "notes" ? "none" : "notes")
          }
        >
          <MessageSquare className="mr-1.5 size-4" />
          Paste Call Notes
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setUploadMode(uploadMode === "website" ? "none" : "website")
          }
        >
          <Globe className="mr-1.5 size-4" />
          Add Website
        </Button>
      </div>

      {/* Upload forms */}
      {uploadMode === "file" && (
        <div className="mb-6 rounded-xl border bg-card p-5">
          <p className="mb-3 text-sm font-medium">Upload a pitch deck (PDF)</p>
          <Input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            disabled={uploading}
          />
          {uploading && (
            <p className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Uploading & extracting…
            </p>
          )}
        </div>
      )}

      {uploadMode === "notes" && (
        <div className="mb-6 rounded-xl border bg-card p-5">
          <p className="mb-3 text-sm font-medium">Paste call notes</p>
          <Textarea
            placeholder="Paste your call notes here…"
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            rows={6}
            className="mb-3"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleNotesSubmit}
              disabled={uploading || !notesText.trim()}
            >
              {uploading ? "Saving…" : "Save Notes"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUploadMode("none")}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {uploadMode === "website" && (
        <div className="mb-6 rounded-xl border bg-card p-5">
          <p className="mb-3 text-sm font-medium">Add a website URL</p>
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleWebsiteSubmit()}
              className="max-w-md"
            />
            <Button
              size="sm"
              onClick={handleWebsiteSubmit}
              disabled={uploading || !websiteUrl.trim()}
            >
              {uploading ? "Fetching…" : "Add"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUploadMode("none")}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="text-muted-foreground py-10 text-center">Loading…</div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16">
          <FileText className="text-muted-foreground mb-3 size-10" />
          <p className="text-muted-foreground">No documents yet.</p>
          <p className="text-muted-foreground text-sm">
            Upload a deck, paste notes, or add a website.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">{typeIcon(doc.type)}</span>
                <div>
                  <p className="text-sm font-medium capitalize">{doc.type.replace("_", " ")}</p>
                  {doc.url && (
                    <p className="text-muted-foreground max-w-xs truncate text-xs">
                      {doc.url}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {statusBadge(doc.status)}
                <span className="text-muted-foreground text-xs">
                  {new Date(doc.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
