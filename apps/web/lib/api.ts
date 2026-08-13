import type { ApiError } from "@/lib/types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export class ApiRequestError extends Error {
  code: string;
  correlationId: string;
  status: number;
  fieldErrors: Record<string, string>;

  constructor(payload: ApiError, status: number) {
    super(payload.message);
    this.name = "ApiRequestError";
    this.code = payload.code;
    this.correlationId = payload.correlation_id;
    this.status = status;
    this.fieldErrors = Object.fromEntries(
      (payload.details?.fields ?? []).map((field) => [field.path, field.message]),
    );
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const fallback: ApiError = {
      code: "REQUEST_FAILED",
      message: "OpsLedger could not complete that request.",
      correlation_id: response.headers.get("x-correlation-id") ?? "unavailable",
    };
    let payload = fallback;
    try {
      payload = (await response.json()) as ApiError;
    } catch {
      // The stable fallback keeps infrastructure errors safe for the interface.
    }
    throw new ApiRequestError(payload, response.status);
  }

  return (await response.json()) as T;
}

export function idempotencyHeaders(): HeadersInit {
  return { "Idempotency-Key": crypto.randomUUID() };
}

export function assetUrl(path: string): string {
  return `${API_BASE}${path}`;
}
