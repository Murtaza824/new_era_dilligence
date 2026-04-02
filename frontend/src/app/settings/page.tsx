"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, XCircle, Clock, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { granolaApi, type GranolaStatus, type GranolaSyncRecord } from "@/lib/api";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Manage integrations and automation for Jarvis.
      </p>
      <div className="space-y-6">
        <GranolaIntegrationCard />
      </div>
    </div>
  );
}

function GranolaIntegrationCard() {
  const [status, setStatus] = useState<GranolaStatus | null>(null);
  const [history, setHistory] = useState<GranolaSyncRecord[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try {
      const [s, h] = await Promise.all([granolaApi.status(), granolaApi.history(10)]);
      setStatus(s);
      setHistory(h);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load status");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await granolaApi.sync();
      // Refresh status after a short delay to give the background task time
      setTimeout(load, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (!loaded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            Granola Meeting Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              Granola Meeting Notes
            </CardTitle>
            <CardDescription className="mt-1">
              Automatically sync meeting notes from Granola into your dealflow
              pipeline. New meetings are polled every{" "}
              {status?.sync_interval_minutes ?? 5} minutes.
              {status?.folder_filter && (
                <span className="mt-1 block">
                  Filtering to folder: <strong>{status.folder_filter}</strong>
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {status?.configured ? (
              <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium">
                <CheckCircle2 className="size-3" />
                Connected
              </span>
            ) : (
              <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium">
                <XCircle className="size-3" />
                Not configured
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-destructive text-sm">{error}</p>
        )}

        {!status?.configured && (
          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <p className="font-medium">Setup required</p>
            <ol className="text-muted-foreground mt-2 list-inside list-decimal space-y-1">
              <li>Open the Granola desktop app</li>
              <li>Go to Settings &rarr; API &rarr; Create new key</li>
              <li>Select &quot;Personal API key&quot; and generate</li>
              <li>
                Add <code className="bg-muted rounded px-1 py-0.5 text-xs">GRANOLA_API_KEY=grn_...</code> to your backend <code className="bg-muted rounded px-1 py-0.5 text-xs">.env</code> file
              </li>
              <li>Restart the backend server</li>
            </ol>
            <p className="text-muted-foreground mt-2 text-xs">
              Requires a Granola Business or Enterprise plan.
            </p>
          </div>
        )}

        {status?.configured && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  Status
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {status.sync_enabled ? "Auto-sync on" : "Auto-sync off"}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  Folder
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {status.folder_filter ?? "All notes"}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  Notes Synced
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {status.total_notes_synced}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  Last Sync
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {status.last_sync_at
                    ? new Date(status.last_sync_at).toLocaleString()
                    : "Never"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={handleSync}
                disabled={syncing}
              >
                <RefreshCw className={`mr-1.5 size-3.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing..." : "Sync Now"}
              </Button>
              <span className="text-muted-foreground text-xs">
                Trigger a manual sync of new Granola notes
              </span>
            </div>

            {history.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium">Recent Synced Notes</h4>
                <div className="divide-y rounded-lg border">
                  {history.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="text-muted-foreground size-3.5" />
                        <span className="font-medium">
                          {record.note_title || record.granola_note_id}
                        </span>
                      </div>
                      <div className="text-muted-foreground flex items-center gap-3 text-xs">
                        {record.dealflow_entry_id && (
                          <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full px-2 py-0.5">
                            Deal created
                          </span>
                        )}
                        {record.processed_at &&
                          new Date(record.processed_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
