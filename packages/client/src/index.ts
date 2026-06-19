/**
 * @transcribevideototext/client
 *
 * Typed, isomorphic client for the VideoToText public REST API (/api/v1).
 * Wraps every endpoint, maps the `{ error: { code, message } }` envelope onto a
 * thrown `VideoToTextError`, and adds upload + polling conveniences so callers can
 * treat the asynchronous transcription flow as a single awaited call.
 */

export const DEFAULT_BASE_URL = "https://www.transcribevideototext.com/api/v1";

export type TranscriptionStatus = "pending" | "processing" | "completed" | "failed";

/** Error codes returned by the API envelope, plus client-side failure modes. */
export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "payment_required"
  | "conflict"
  | "invalid_request"
  | "rate_limited"
  | "internal_error"
  | "network_error"
  | "timeout";

export interface Segment {
  start: number;
  end: number;
  text: string;
  speaker: string | null;
}

export interface Transcription {
  id: string;
  status: TranscriptionStatus;
  locked: boolean;
  language: string | null;
  durationSeconds: number | null;
  fileName: string;
  mediaType: string | null;
  segments: Segment[];
  audioUrl: string | null;
  isPublic: boolean;
  error: string | null;
  createdAt: string;
}

export interface TranscriptionListItem {
  id: string;
  fileName: string;
  status: TranscriptionStatus;
  durationSeconds: number | null;
  language: string | null;
  mediaType: string | null;
  createdAt: string;
}

export interface TranscriptionList {
  items: TranscriptionListItem[];
  total: number;
}

export interface CreateUploadResponse {
  path: string;
  signedUrl: string;
}

export interface CreatedTranscription {
  id: string;
  status: "pending";
}

export interface CreateUploadInput {
  fileName: string;
  contentType: string;
}

/** Provide exactly one of `storagePath` (from an upload) or `url` (public https source). */
export interface CreateTranscriptionInput {
  storagePath?: string;
  url?: string;
  fileName?: string;
  fileSizeBytes?: number;
  mediaType?: string;
  /** ISO 639-1 code (e.g. `en`) or `auto` to auto-detect. */
  language?: string;
  diarize?: boolean;
}

export interface ListTranscriptionsQuery {
  page?: number;
  perPage?: number;
}

export interface ClientOptions {
  apiKey: string;
  /** Defaults to the production API. Pass a base ending in `/api/v1`. */
  baseUrl?: string;
  /** Override the fetch implementation (tests, custom agents). */
  fetch?: typeof fetch;
}

export interface PollOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called with each polled snapshot (including the terminal one). Useful for progress UI. */
  onPoll?: (transcription: Transcription) => void;
}

/** Error thrown for any non-2xx response or client-side failure. */
export class VideoToTextError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, status: number, message: string) {
    super(message);
    this.name = "VideoToTextError";
    this.code = code;
    this.status = status;
  }
}

const TERMINAL_STATUSES: ReadonlySet<TranscriptionStatus> = new Set(["completed", "failed"]);

export function isTerminal(status: TranscriptionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new VideoToTextError("timeout", 0, "Polling aborted."));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new VideoToTextError("timeout", 0, "Polling aborted."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface VideoToTextClient {
  createUploadUrl(input: CreateUploadInput): Promise<CreateUploadResponse>;
  createTranscription(
    input: CreateTranscriptionInput,
    opts?: { idempotencyKey?: string },
  ): Promise<CreatedTranscription>;
  getTranscription(id: string): Promise<Transcription>;
  listTranscriptions(query?: ListTranscriptionsQuery): Promise<TranscriptionList>;
  deleteTranscription(id: string): Promise<{ success: boolean }>;
  /** Sign an upload URL and PUT the bytes; returns the `storagePath` to pass to createTranscription. */
  uploadBytes(input: {
    data: Uint8Array | ArrayBuffer | Blob;
    fileName: string;
    contentType: string;
  }): Promise<{ path: string }>;
  /** Poll a job until it reaches `completed`/`failed` (or timeout). */
  waitForTranscription(id: string, opts?: PollOptions): Promise<Transcription>;
  /** Create a job, then poll until terminal — the synchronous-feeling path for agents. */
  transcribeAndWait(
    input: CreateTranscriptionInput,
    opts?: PollOptions & { idempotencyKey?: string },
  ): Promise<Transcription>;
}

export function createClient(options: ClientOptions): VideoToTextClient {
  const { apiKey } = options;
  if (!apiKey) throw new VideoToTextError("unauthorized", 401, "An API key is required.");

  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const doFetch = options.fetch ?? globalThis.fetch;
  if (!doFetch) {
    throw new VideoToTextError(
      "network_error",
      0,
      "No fetch implementation found. Use Node 20+ or pass `fetch` in ClientOptions.",
    );
  }

  async function request<T>(
    path: string,
    init: {
      method: string;
      body?: unknown;
      headers?: Record<string, string>;
      query?: Record<string, string | number | boolean | undefined>;
    },
  ): Promise<T> {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await doFetch(url.toString(), {
        method: init.method,
        headers: {
          authorization: `Bearer ${apiKey}`,
          ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
          ...init.headers,
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch (cause) {
      throw new VideoToTextError("network_error", 0, `Request failed: ${(cause as Error).message}`);
    }

    const text = await response.text();
    const data: unknown = text ? safeJsonParse(text) : undefined;

    if (!response.ok) {
      const envelope = (data as { error?: { code?: ErrorCode; message?: string } } | undefined)?.error;
      throw new VideoToTextError(
        envelope?.code ?? "internal_error",
        response.status,
        envelope?.message ?? `Request failed with status ${response.status}.`,
      );
    }

    return data as T;
  }

  const client: VideoToTextClient = {
    createUploadUrl(input) {
      return request<CreateUploadResponse>("/uploads", { method: "POST", body: input });
    },

    createTranscription(input, opts) {
      return request<CreatedTranscription>("/transcriptions", {
        method: "POST",
        body: input,
        headers: opts?.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : undefined,
      });
    },

    getTranscription(id) {
      return request<Transcription>(`/transcriptions/${encodeURIComponent(id)}`, { method: "GET" });
    },

    listTranscriptions(query) {
      return request<TranscriptionList>("/transcriptions", {
        method: "GET",
        query: { page: query?.page, perPage: query?.perPage },
      });
    },

    deleteTranscription(id) {
      return request<{ success: boolean }>(`/transcriptions/${encodeURIComponent(id)}`, { method: "DELETE" });
    },

    async uploadBytes({ data, fileName, contentType }) {
      const { path, signedUrl } = await client.createUploadUrl({ fileName, contentType });
      let putResponse: Response;
      try {
        putResponse = await doFetch(signedUrl, {
          method: "PUT",
          headers: { "content-type": contentType },
          body: data as BodyInit,
        });
      } catch (cause) {
        throw new VideoToTextError("network_error", 0, `Upload failed: ${(cause as Error).message}`);
      }
      if (!putResponse.ok) {
        throw new VideoToTextError(
          "network_error",
          putResponse.status,
          `Upload failed with status ${putResponse.status}.`,
        );
      }
      return { path };
    },

    async waitForTranscription(id, opts) {
      const pollIntervalMs = opts?.pollIntervalMs ?? 3000;
      const timeoutMs = opts?.timeoutMs ?? 600_000;
      const deadline = nowMs() + timeoutMs;

      // First read is immediate; subsequent reads wait one interval.
      for (let attempt = 0; ; attempt++) {
        if (attempt > 0) await sleep(pollIntervalMs, opts?.signal);
        const transcription = await client.getTranscription(id);
        opts?.onPoll?.(transcription);
        if (isTerminal(transcription.status)) return transcription;
        if (nowMs() >= deadline) {
          throw new VideoToTextError(
            "timeout",
            0,
            `Transcription ${id} did not finish within ${Math.round(timeoutMs / 1000)}s (last status: ${transcription.status}). It is still processing — fetch it later by id.`,
          );
        }
      }
    },

    async transcribeAndWait(input, opts) {
      const { id } = await client.createTranscription(input, { idempotencyKey: opts?.idempotencyKey });
      return client.waitForTranscription(id, opts);
    },
  };

  return client;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function nowMs(): number {
  return Date.now();
}
