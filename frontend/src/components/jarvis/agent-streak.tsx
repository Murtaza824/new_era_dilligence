"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/contexts/auth-context";
import { activity as activityApi } from "@/lib/api";

const POLL_INTERVAL_MS = 4000;

export function AgentStreak() {
  const { user } = useAuth();
  const [hasRunning, setHasRunning] = useState(false);

  const check = useCallback(() => {
    activityApi
      .list()
      .then((jobs) => {
        const running = jobs.some(
          (j) => j.status === "pending" || j.status === "running",
        );
        setHasRunning(running);
      })
      .catch(() => setHasRunning(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user, check]);

  if (!hasRunning) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-[2px] overflow-hidden">
      <div className="agent-streak h-full w-full" />
      <style jsx>{`
        .agent-streak {
          background: linear-gradient(
            90deg,
            transparent 0%,
            hsl(var(--primary)) 20%,
            hsl(var(--primary) / 0.6) 40%,
            hsl(var(--primary)) 60%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: streak 1.8s ease-in-out infinite;
        }
        @keyframes streak {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>
    </div>
  );
}
