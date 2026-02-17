/**
 * Typed API client for the Jarvis backend.
 */
import type { Company, Document, Memo, SimulationRun, SimulationSuggestion, PortfolioSnapshot, PortfolioUpdateEntry, PortfolioSimulationLatest, PortfolioSimulationOutputs, User, TokenResponse } from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "jarvis_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...opts?.headers,
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `API error ${res.status}`);
  }
  return res.json();
}

const AUTH_TIMEOUT_MS = 15_000;

async function authRequest<T>(path: string, opts?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const token = getToken();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...opts?.headers,
    };
    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `API error ${res.status}`);
    }
    return res.json();
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        throw new Error(
          "Request timed out. Make sure the backend is running (e.g. uvicorn app.main:app --reload) and NEXT_PUBLIC_API_URL is correct."
        );
      }
      if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
        throw new Error(
          "Cannot reach the backend. Is it running? Check NEXT_PUBLIC_API_URL (e.g. http://localhost:8000)."
        );
      }
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Auth ────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    authRequest<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => authRequest<User>("/auth/me"),
};

// ── Companies ────────────────────────────────────────────────────────────

export const companies = {
  list: () => request<Company[]>("/companies"),

  get: (id: string) => request<Company>(`/companies/${id}`),

  create: (name: string) =>
    request<Company>("/companies", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  delete: (id: string) =>
    request<{ ok: boolean }>(`/companies/${id}`, { method: "DELETE" }),
};

// ── Documents ────────────────────────────────────────────────────────────

export const documents = {
  list: (companyId: string) =>
    request<Document[]>(`/companies/${companyId}/documents`),

  uploadJson: (companyId: string, body: { type: string; content?: string; url?: string }) =>
    request<Document>(`/companies/${companyId}/documents`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  uploadFile: async (companyId: string, file: File, docType = "deck"): Promise<Document> => {
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    const token = getToken();
    const headers: HeadersInit = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/companies/${companyId}/documents/upload`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `Upload failed ${res.status}`);
    }
    return res.json();
  },

  /** Download the original file (e.g. PDF). Triggers a file save in the browser. */
  downloadFile: async (
    companyId: string,
    documentId: string,
    filename?: string,
  ): Promise<void> => {
    const token = getToken();
    const headers: HeadersInit = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(
      `${BASE}/companies/${companyId}/documents/${documentId}/file`,
      { headers },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `Download failed ${res.status}`);
    }
    const blob = await res.blob();
    const name =
      filename ||
      res.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] ||
      "document.pdf";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// ── Memos ────────────────────────────────────────────────────────────────

export const memos = {
  get: (companyId: string) => request<Memo>(`/companies/${companyId}/memo`),

  generate: (companyId: string) =>
    request<Memo>(`/companies/${companyId}/memo/generate`, { method: "POST" }),

  revise: (companyId: string) =>
    request<Memo>(`/companies/${companyId}/memo/revise`, { method: "POST" }),

  refineSection: (companyId: string, sectionTitle: string, instructions: string) =>
    request<Memo>(`/companies/${companyId}/memo/section/refine`, {
      method: "POST",
      body: JSON.stringify({ section_title: sectionTitle, instructions }),
    }),

  regenerateSection: (companyId: string, sectionTitle: string, instructions = "") =>
    request<Memo>(`/companies/${companyId}/memo/section/regenerate`, {
      method: "POST",
      body: JSON.stringify({ section_title: sectionTitle, instructions }),
    }),

  addContext: (companyId: string, content: string) =>
    request<{ title: string; content: string }>(`/companies/${companyId}/memo/add-context`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  versions: (companyId: string) =>
    request<Memo[]>(`/companies/${companyId}/memo/versions`),

  exportUrl: (companyId: string, format = "md") =>
    `${BASE}/companies/${companyId}/memo/export?format=${format}`,
};

// ── Simulations ──────────────────────────────────────────────────────────

export const simulations = {
  run: (companyId: string, params: Record<string, unknown>) =>
    request<SimulationRun>(`/companies/${companyId}/simulations`, {
      method: "POST",
      body: JSON.stringify(params),
    }),

  list: (companyId: string) =>
    request<SimulationRun[]>(`/companies/${companyId}/simulations`),

  suggest: (companyId: string) =>
    request<SimulationSuggestion>(`/companies/${companyId}/simulations/suggest`),
};

// ── Portfolio ────────────────────────────────────────────────────────────

export const portfolioApi = {
  list: () => request<PortfolioSnapshot[]>("/portfolio"),

  get: (id: string) => request<PortfolioSnapshot>(`/portfolio/${id}`),

  create: (body: Partial<PortfolioSnapshot>) =>
    request<PortfolioSnapshot>("/portfolio", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, body: Partial<PortfolioSnapshot>) =>
    request<PortfolioSnapshot>(`/portfolio/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  delete: (id: string) =>
    request<{ ok: boolean }>(`/portfolio/${id}`, { method: "DELETE" }),

  addFromCompany: (companyId: string) =>
    request<PortfolioSnapshot>(`/companies/${companyId}/add-to-portfolio`, {
      method: "POST",
    }),

  clear: () => request<{ ok: boolean }>("/portfolio", { method: "DELETE" }),

  // Updates / notes
  listUpdates: (id: string) =>
    request<PortfolioUpdateEntry[]>(`/portfolio/${id}/updates`),

  addUpdate: (id: string, content: string, source?: string) =>
    request<PortfolioUpdateEntry>(`/portfolio/${id}/updates`, {
      method: "POST",
      body: JSON.stringify({ content, source }),
    }),

  // Portfolio simulations (AI-powered, uses RAG context)
  runSim: (entryId: string) =>
    request<SimulationRun>(`/portfolio/${entryId}/simulate`, {
      method: "POST",
    }),

  listSims: (entryId: string) =>
    request<SimulationRun[]>(`/portfolio/${entryId}/simulations`),

  // Portfolio-level latent-factor simulation
  runPortfolioSimulation: () =>
    request<{ id: string; created_at: string; trigger: string; inputs: Record<string, unknown>; outputs: PortfolioSimulationOutputs }>(
      "/portfolio/simulate-portfolio",
      { method: "POST" }
    ),

  getLatestPortfolioSimulation: () =>
    request<PortfolioSimulationLatest>("/portfolio/simulation/latest"),
};
