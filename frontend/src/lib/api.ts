/**
 * Typed API client for the Jarvis backend.
 */
import type { AgentJob, Company, DealflowDocument, DealflowEntry, DealflowFounder, Document, IntroductionSuggestion, Memo, NetworkContact, SimulationRun, SimulationSuggestion, PortfolioSnapshot, PortfolioUpdateEntry, PortfolioSimulationLatest, PortfolioSimulationOutputs, User, TokenResponse, DealSuggestions } from "@/types";

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

function apiErrorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string; loc?: unknown[] };
    return first.msg ?? JSON.stringify(first);
  }
  return fallback;
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
    throw new Error(apiErrorMessage(body.detail, `API error ${res.status}`));
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
          "Cannot reach the backend. On Vercel: set NEXT_PUBLIC_API_URL in Settings → Environment Variables to your Railway API URL (e.g. https://your-app.up.railway.app), then redeploy—env is set at build time."
        );
      }
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** POST that may return 202 Accepted with { job_id, message }. Does not throw on 202. */
async function requestPostAccept202(path: string): Promise<{ job_id: string; message: string }> {
  const token = getToken();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers });
  if (res.status === 202) {
    return res.json();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `API error ${res.status}`);
  }
  return res.json();
}

// ── Activity ────────────────────────────────────────────────────────────

export const activity = {
  list: () => request<AgentJob[]>("/activity"),
  getJob: (jobId: string) => request<AgentJob>(`/activity/jobs/${jobId}`),
};

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

  create: (body: { name: string; website?: string }) =>
    request<Company>("/companies", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, body: Partial<Pick<Company, "name" | "logo_url" | "entry_valuation" | "amount_raising" | "investment_stage">>) =>
    request<Company>(`/companies/update/${id}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  refreshLogo: (id: string) =>
    request<Company>(`/companies/${id}/refresh-logo`, { method: "POST" }),

  suggestDealFromDocuments: (id: string) =>
    request<DealSuggestions>(`/companies/${id}/deal-suggestions/from-documents`, { method: "POST" }),

  suggestDealFromWeb: (id: string) =>
    request<DealSuggestions>(`/companies/${id}/deal-suggestions/from-web`, { method: "POST" }),

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

  delete: (companyId: string, documentId: string) =>
    request<{ ok: boolean }>(`/companies/${companyId}/documents/${documentId}`, {
      method: "DELETE",
    }),

  /** Re-index all documents for this company into RAG so memo generation has source materials. */
  reindex: (companyId: string) =>
    request<{ indexed: number; chunks: number }>(
      `/companies/${companyId}/documents/reindex`,
      { method: "POST" },
    ),

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

  /** Starts memo generation in the background. Returns job_id (202). */
  generate: (companyId: string) =>
    requestPostAccept202(`/companies/${companyId}/memo/generate`),

  /** Starts memo revision in the background. Returns job_id (202). */
  revise: (companyId: string) =>
    requestPostAccept202(`/companies/${companyId}/memo/revise`),

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

// ── Network ──────────────────────────────────────────────────────────────

export interface RelationshipManager {
  id: string;
  email: string;
}

export const networkApi = {
  getRelationshipManagers: () =>
    request<RelationshipManager[]>("/network/relationship-managers"),
  contacts: {
    list: (params?: { q?: string; tags?: string; added_by?: string }) => {
      const sp = new URLSearchParams();
      if (params?.q) sp.set("q", params.q);
      if (params?.tags) sp.set("tags", params.tags);
      if (params?.added_by) sp.set("added_by", params.added_by);
      const query = sp.toString();
      return request<NetworkContact[]>(`/network/contacts${query ? `?${query}` : ""}`);
    },
    get: (id: string) => request<NetworkContact>(`/network/contacts/${id}`),
    create: (body: { name: string; email?: string; phone_number?: string; location?: string; company_name?: string; role_or_title?: string; linkedin_url?: string; skills?: string; notes?: string; tags?: string; nev_fund_i_lp?: boolean; nev_syndicate_lp?: boolean; added_by_user_id?: string }) =>
      request<NetworkContact>("/network/contacts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<Pick<NetworkContact, "name" | "email" | "phone_number" | "location" | "company_name" | "role_or_title" | "linkedin_url" | "skills" | "notes" | "tags">>) =>
      request<NetworkContact>(`/network/contacts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/network/contacts/${id}`, { method: "DELETE" }),
    /** Import contacts from CSV. Returns imported count, skipped, and any row errors. */
    importCsv: async (file: File): Promise<{ imported: number; skipped: number; errors: string[] }> => {
      const token = getToken();
      const form = new FormData();
      form.append("file", file);
      const headers: HeadersInit = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BASE}/network/contacts/import`, {
        method: "POST",
        headers,
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(body.detail, `Import failed ${res.status}`));
      }
      return res.json();
    },
  },
  suggestions: {
    list: (params?: { status?: string; contact_id?: string; company_id?: string; portfolio_id?: string }) => {
      const sp = new URLSearchParams();
      if (params?.status) sp.set("status", params.status);
      if (params?.contact_id) sp.set("contact_id", params.contact_id);
      if (params?.company_id) sp.set("company_id", params.company_id);
      if (params?.portfolio_id) sp.set("portfolio_id", params.portfolio_id);
      const query = sp.toString();
      return request<IntroductionSuggestion[]>(`/network/suggestions${query ? `?${query}` : ""}`);
    },
    get: (id: string) => request<IntroductionSuggestion>(`/network/suggestions/${id}`),
    updateStatus: (id: string, status: "introduced" | "dismissed") =>
      request<IntroductionSuggestion>(`/network/suggestions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  },
};

// ── Dealflow ──────────────────────────────────────────────────────────────

export type DealflowEntryCreateBody = {
  name: string;
  website?: string;
  company_linkedin_url?: string;
  one_liner?: string;
  location?: string;
  stage?: string;
  amount_raising?: number;
  valuation?: number;
  notes?: string;
  source_type?: string;
  source_detail?: string;
  status?: string;
  founders?: { name: string; linkedin_url?: string; twitter_url?: string; email?: string }[];
};

export type DealflowEntryUpdateBody = Partial<DealflowEntryCreateBody>;

export const dealflowApi = {
  entries: {
    list: (params?: { q?: string; status?: string; source_type?: string; stage?: string }) => {
      const sp = new URLSearchParams();
      if (params?.q) sp.set("q", params.q);
      if (params?.status) sp.set("status", params.status);
      if (params?.source_type) sp.set("source_type", params.source_type);
      if (params?.stage) sp.set("stage", params.stage);
      const query = sp.toString();
      return request<DealflowEntry[]>(`/dealflow/entries${query ? `?${query}` : ""}`);
    },
    get: (id: string) => request<DealflowEntry>(`/dealflow/entries/${id}`),
    create: (body: DealflowEntryCreateBody) =>
      request<DealflowEntry>("/dealflow/entries", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: DealflowEntryUpdateBody) =>
      request<DealflowEntry>(`/dealflow/entries/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/dealflow/entries/${id}`, { method: "DELETE" }),
    addFounder: (entryId: string, body: { name: string; linkedin_url?: string; twitter_url?: string; email?: string }) =>
      request<DealflowFounder>(`/dealflow/entries/${entryId}/founders`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    deleteFounder: (entryId: string, founderId: string) =>
      request<{ ok: boolean }>(`/dealflow/entries/${entryId}/founders/${founderId}`, {
        method: "DELETE",
      }),
    promoteToDealRoom: (entryId: string, copyDocuments = true) =>
      request<{ company_id: string; message: string }>(
        `/dealflow/entries/${entryId}/promote-to-deal-room?copy_documents=${copyDocuments}`,
        { method: "POST" }
      ),
  },
  documents: {
    list: (entryId: string) =>
      request<DealflowDocument[]>(`/dealflow/entries/${entryId}/documents`),
    addLink: (entryId: string, body: { type: string; url?: string }) =>
      request<DealflowDocument>(`/dealflow/entries/${entryId}/documents`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    uploadFile: async (entryId: string, file: File, docType = "pitch_deck"): Promise<DealflowDocument> => {
      const form = new FormData();
      form.append("file", file);
      form.append("doc_type", docType);
      const token = getToken();
      const headers: HeadersInit = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BASE}/dealflow/entries/${entryId}/documents/upload`, {
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
    delete: (entryId: string, documentId: string) =>
      request<{ ok: boolean }>(`/dealflow/entries/${entryId}/documents/${documentId}`, {
        method: "DELETE",
      }),
    downloadFile: async (entryId: string, documentId: string, filename?: string): Promise<void> => {
      const token = getToken();
      const headers: HeadersInit = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(
        `${BASE}/dealflow/entries/${entryId}/documents/${documentId}/file`,
        { headers }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Download failed");
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
  },
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
