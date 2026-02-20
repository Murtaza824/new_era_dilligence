"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Check, Clock, Loader2, User, X } from "lucide-react";

import { activity as activityApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AgentJob } from "@/types";

const POLL_INTERVAL_MS = 6000;

function jobTypeLabel(type: string): string {
  if (type === "memo_generate") return "Memo generation";
  return type.replace(/_/g, " ");
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "Just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  return `${Math.floor(sec / 86400)} d ago`;
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

interface Props {
  isOpen: boolean;
  onClose?: () => void;
}

export function AgentActivityPanel({ isOpen, onClose }: Props) {
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(() => {
    activityApi
      .list()
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchActivity();
    const id = setInterval(fetchActivity, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isOpen, fetchActivity]);

  if (!isOpen) return null;

  return (
    <div className="border-muted flex h-full w-[340px] shrink-0 flex-col border-l bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-display text-sm font-semibold">Agent activity</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
            aria-label="Close panel"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No active tasks. Start a memo or upload documents to see agents in action.
          </p>
        ) : (
          <ul className="space-y-2">
            {jobs.map((job) => {
              const isRunning = job.status === "pending" || job.status === "running";
              const label = job.entity_label || job.entity_id;
              const href =
                job.type === "memo_generate" && job.entity_type === "company"
                  ? `/companies/${job.entity_id}?tab=memo`
                  : null;
              const duration = formatDuration(job.duration_seconds);

              const cardContent = (
                <>
                  <div className="mt-0.5 shrink-0">
                    {isRunning ? (
                      <Loader2 className="text-muted-foreground size-4 animate-spin" />
                    ) : job.status === "completed" ? (
                      <Check className="text-green-600 size-4" />
                    ) : (
                      <X className="text-destructive size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{jobTypeLabel(job.type)}</p>
                    <p className="text-muted-foreground truncate text-xs">{label}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        {isRunning
                          ? `Started ${timeAgo(job.created_at)}`
                          : job.completed_at
                            ? `Completed ${timeAgo(job.completed_at)}`
                            : `Updated ${timeAgo(job.updated_at)}`}
                      </span>
                      {duration && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="size-3" />
                          {duration}
                        </span>
                      )}
                    </div>
                    {job.triggered_by_user_email && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="size-3" />
                        {job.triggered_by_user_email.split("@")[0]}
                      </p>
                    )}
                    {job.status === "failed" && job.error && (
                      <p className="mt-1 truncate text-xs text-destructive" title={job.error}>
                        {job.error}
                      </p>
                    )}
                  </div>
                </>
              );

              return (
                <li key={job.id}>
                  {href ? (
                    <Link
                      href={href}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                        "hover:bg-muted/50",
                      )}
                    >
                      {cardContent}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 rounded-lg border p-3">
                      {cardContent}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
