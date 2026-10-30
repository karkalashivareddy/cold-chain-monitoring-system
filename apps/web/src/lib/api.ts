import type { ApiMeta } from "@frostguard/shared";

const API_BASE = "/api/v1";
const CSRF_HEADER = "x-frostguard-csrf";

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

export interface PageResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(message: string, options: { code?: string; status?: number; details?: unknown; requestId?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = options.code ?? "INTERNAL_ERROR";
    this.status = options.status ?? 500;
    this.details = options.details;
    this.requestId = options.requestId;
  }
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

let accessToken: string | null = null;

/** Access tokens live in memory only; the httpOnly cookie remains the fallback. */
export function setAccessToken(value: string | null): void {
  accessToken = value;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function buildQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const serialised = params.toString();
  return serialised ? `?${serialised}` : "";
}

type Envelope<T> = { success: true; data: T; meta?: ApiMeta };
type ErrorEnvelope = {
  success: false;
  error?: { code?: string; message?: string; details?: unknown };
  meta?: { requestId?: string };
};

type RequestOptions = {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", [CSRF_HEADER]: "1" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      accessToken = null;
      return null;
    }
    const envelope = (await res.json()) as Envelope<{ accessToken: string }>;
    accessToken = envelope.data.accessToken;
    return accessToken;
  } catch {
    accessToken = null;
    return null;
  }
}

/** Single-flight refresh so a burst of 401s cannot rotate the token family twice. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function requestEnvelope<T>(method: string, path: string, options: RequestOptions = {}, allowRetry = true): Promise<{ data: T; meta?: ApiMeta }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    [CSRF_HEADER]: "1",
    ...options.headers,
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}${path}${buildQuery(options.query)}`, {
    method,
    credentials: "include",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  const canRefresh = allowRetry && !path.startsWith("/auth/login") && !path.startsWith("/auth/refresh");

  if (res.status === 401 && canRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return requestEnvelope<T>(method, path, options, false);
    window.dispatchEvent(new Event("fg:session-expired"));
  }

  const payload = (await res.json().catch(() => null)) as Envelope<T> | ErrorEnvelope | null;

  if (!res.ok || !payload || payload.success === false) {
    const errorPayload = (payload as ErrorEnvelope | null)?.error;
    throw new ApiError(errorPayload?.message ?? `Request failed with status ${res.status}`, {
      code: errorPayload?.code,
      status: res.status,
      details: errorPayload?.details,
      requestId: (payload as ErrorEnvelope | null)?.meta?.requestId,
    });
  }

  return { data: payload.data, meta: payload.meta };
}

async function request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
  return (await requestEnvelope<T>(method, path, options)).data;
}

export const api = {
  get<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
    return request<T>("GET", path, { query, signal });
  },

  async page<T>(path: string, query?: Query, signal?: AbortSignal): Promise<PageResult<T>> {
    const { data, meta } = await requestEnvelope<T[]>("GET", path, { query, signal });
    return {
      data,
      total: meta?.total ?? data.length,
      page: meta?.page ?? 1,
      pageSize: meta?.pageSize ?? data.length,
      totalPages: meta?.totalPages ?? 1,
    };
  },

  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body">): Promise<T> {
    return request<T>("POST", path, { ...options, body: body ?? {} });
  },

  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body">): Promise<T> {
    return request<T>("PATCH", path, { ...options, body: body ?? {} });
  },

  delete<T>(path: string, options?: Omit<RequestOptions, "body">): Promise<T> {
    return request<T>("DELETE", path, options);
  },

  async download(path: string, filename: string): Promise<void> {
    const headers: Record<string, string> = { Accept: "application/pdf, application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(`${API_BASE}${path}`, { credentials: "include", headers });
    if (!res.ok) throw new ApiError(`Download failed (${res.status})`, { status: res.status });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};
