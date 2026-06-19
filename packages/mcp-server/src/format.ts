/**
 * Human-readable formatting of transcription results for MCP tool output.
 * Agents read these strings directly, so they lead with status/flags and then
 * the full transcript text (speaker-prefixed when diarized).
 */

import type { Transcription, TranscriptionListItem } from "@transcribevideototext/client";

export function transcriptText(t: Transcription): string {
  if (t.segments.length === 0) return t.error ?? "(no transcript text available)";
  return t.segments.map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text)).join("\n");
}

export function formatTranscription(t: Transcription): string {
  const lines = [`Transcription ${t.id} — status: ${t.status}`];
  if (t.fileName) lines.push(`File: ${t.fileName}`);
  if (t.language) lines.push(`Language: ${t.language}`);
  if (t.durationSeconds != null) lines.push(`Duration: ${formatSeconds(t.durationSeconds)}`);
  if (t.locked) {
    lines.push(
      "⚠️ This result is LOCKED to a short preview because it exceeds the account's available minutes. " +
        "Add credits in the dashboard, then fetch it again with get_transcription to unlock the full transcript.",
    );
  }
  if (t.status === "failed") lines.push(`Error: ${t.error ?? "unknown error"}`);
  if (t.status === "completed" || t.segments.length > 0) {
    lines.push("", transcriptText(t));
  }
  return lines.join("\n");
}

export function formatList(items: TranscriptionListItem[], total: number): string {
  if (items.length === 0) return "No transcriptions found.";
  const rows = items.map((t) => {
    const duration = t.durationSeconds != null ? ` · ${formatSeconds(t.durationSeconds)}` : "";
    return `• ${t.id} — ${t.status} — ${t.fileName}${duration}`;
  });
  return [`${items.length} of ${total} transcription(s):`, ...rows].join("\n");
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
