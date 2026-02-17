"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function BackendHealth() {
  const [status, setStatus] = useState<"ok" | "error" | "loading">("loading");

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => setStatus(data?.status === "ok" ? "ok" : "error"))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="fixed top-16 right-4 z-50 rounded-md border bg-background px-3 py-2 text-sm shadow-sm">
      Backend:{" "}
      {status === "loading" && <span className="text-muted-foreground">…</span>}
      {status === "ok" && <span className="text-green-600">ok</span>}
      {status === "error" && <span className="text-destructive">error</span>}
    </div>
  );
}
