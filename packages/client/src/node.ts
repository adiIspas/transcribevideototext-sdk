/**
 * Node-only helpers for @transcribevideototext/client.
 *
 * Adds local-filesystem upload on top of the isomorphic core: read a file from disk,
 * infer its content type, push it to signed storage, and (optionally) wait for the
 * transcript. Imported by the CLI and the MCP server; not bundled into browser builds.
 */

import { basename, dirname, extname } from "node:path";
import { openAsBlob } from "node:fs";
import { rm } from "node:fs/promises";
import type { CreateTranscriptionInput, PollOptions, Transcription, VideoToTextClient } from "./index";
import { downloadMedia } from "./ytdlp";

export { isExtractableUrl } from "./ytdlp";

const MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/opus",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
};

export function contentTypeForFile(filePath: string): string {
  return MIME_BY_EXT[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/** Upload a local file to signed storage; returns the `storagePath` for createTranscription. */
export async function uploadFile(
  client: VideoToTextClient,
  filePath: string,
  opts?: { contentType?: string; fileName?: string },
): Promise<{ path: string; fileName: string; contentType: string }> {
  const fileName = opts?.fileName ?? basename(filePath);
  const contentType = opts?.contentType ?? contentTypeForFile(filePath);
  const blob = await openAsBlob(filePath, { type: contentType });
  const { path } = await client.uploadBytes({ data: blob, fileName, contentType });
  return { path, fileName, contentType };
}

/**
 * Download a link from any site yt-dlp supports (YouTube/X/LinkedIn/…) with yt-dlp, upload it to signed storage,
 * and clean up the temp file. Returns the `storagePath` for createTranscription — the same
 * shape as `uploadFile`, so callers transcribe both identically.
 */
export async function uploadFromLink(
  client: VideoToTextClient,
  url: string,
): Promise<{ path: string; fileName: string; contentType: string }> {
  const { filePath, title } = await downloadMedia(url);
  try {
    const safeTitle = title?.replace(/[\\/\r\n]+/g, " ").trim();
    const fileName = safeTitle ? `${safeTitle}${extname(filePath)}`.slice(0, 255) : basename(filePath);
    return await uploadFile(client, filePath, { fileName });
  } finally {
    await rm(dirname(filePath), { recursive: true, force: true });
  }
}

/** Upload a local file and transcribe it, polling until the transcript is ready. */
export async function transcribeFile(
  client: VideoToTextClient,
  filePath: string,
  opts?: Pick<CreateTranscriptionInput, "language" | "diarize"> & PollOptions & { idempotencyKey?: string },
): Promise<Transcription> {
  const { path, fileName, contentType } = await uploadFile(client, filePath);
  return client.transcribeAndWait(
    { storagePath: path, fileName, mediaType: contentType, language: opts?.language, diarize: opts?.diarize },
    opts,
  );
}
