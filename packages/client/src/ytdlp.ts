/**
 * Node-only yt-dlp integration for @transcribevideototext/client.
 *
 * Downloads media from any site yt-dlp supports (YouTube, X, LinkedIn, TikTok, …) on the
 * user's own machine — their residential IP avoids the datacenter blocking that breaks
 * server-side extraction. The yt-dlp binary is auto-fetched and cached on first use, so callers need
 * no setup. Audio-only (`bestaudio`) is preferred to keep downloads small and ffmpeg-free,
 * falling back to the smallest combined stream when no audio-only track exists.
 */

import { spawn, spawnSync } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, rename, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

// A direct media URL — one that ends in an audio/video file — is the only kind the API can
// pull itself. Every other link is an HTML page (a YouTube/X/LinkedIn watch page, or any of
// the many other sites yt-dlp handles) that we must download locally first. Rather than keep
// our own site allowlist, we defer to yt-dlp for anything that isn't already a direct media
// file, so the set of supported sites stays in sync with the bundled binary.
const DIRECT_MEDIA_EXTENSIONS = [
  ".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".oga", ".opus", ".wma",
  ".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi", ".wmv", ".flv", ".mpg", ".mpeg", ".3gp", ".ts",
];

// Re-fetch the cached binary when older than this; sites change often and a stale yt-dlp
// silently stops working. Deleting the cache dir also forces a fresh download.
const REFRESH_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * True when `url` is a page we should download locally before transcribing — i.e. it isn't
 * already a direct media file the API can fetch server-side. Invalid URLs return `false`.
 */
export function isExtractableUrl(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }
  return !DIRECT_MEDIA_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}

function binaryName(): string {
  return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

/** GitHub release asset for the current platform — all are self-contained (no Python needed). */
function assetName(): string {
  if (process.platform === "win32") return "yt-dlp.exe";
  if (process.platform === "darwin") return "yt-dlp_macos";
  return process.arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux";
}

function cacheDir(): string {
  const base =
    process.platform === "win32"
      ? (process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"))
      : (process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"));
  return join(base, "transcribevideototext");
}

function isOnPath(): boolean {
  try {
    const result = spawnSync(binaryName(), ["--version"], { stdio: "ignore" });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadBinary(dest: string): Promise<void> {
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName()}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Failed to download yt-dlp (HTTP ${response.status}).`);
  await mkdir(dirname(dest), { recursive: true });
  const tmp = `${dest}.download`;
  await writeFile(tmp, Buffer.from(await response.arrayBuffer()));
  await chmod(tmp, 0o755); // harmless on Windows
  await rename(tmp, dest); // atomic: a partial download is never used
}

/** Resolve a runnable yt-dlp path: PATH first, otherwise an auto-downloaded cached binary. */
export async function resolveYtDlp(): Promise<string> {
  if (isOnPath()) return binaryName();

  const bin = join(cacheDir(), binaryName());
  let stale = true;
  try {
    stale = Date.now() - (await stat(bin)).mtimeMs > REFRESH_MS;
  } catch {
    stale = true;
  }
  if (stale) {
    try {
      await downloadBinary(bin);
    } catch (error) {
      if (await exists(bin)) return bin; // fall back to the stale-but-working cached binary
      throw error;
    }
  }
  return bin;
}

/**
 * Download a platform link to a temp file via yt-dlp. Returns the downloaded file path and
 * the media title. The caller owns the temp file and must remove its directory when done.
 */
export async function downloadMedia(
  url: string,
  opts?: { signal?: AbortSignal },
): Promise<{ filePath: string; title?: string }> {
  const ytDlp = await resolveYtDlp();
  const dir = await mkdtemp(join(tmpdir(), "vtt-"));
  const args = [
    // YouTube extraction needs a JS runtime; reuse the Node we're already running under
    // so callers don't have to install Deno/Bun separately.
    "--js-runtimes",
    `node:${process.execPath}`,
    "--no-playlist",
    "-f",
    "bestaudio/worst",
    "-o",
    join(dir, "%(id)s.%(ext)s"),
    "--print",
    "%(title)s", // printed at the video stage → first line
    "--print",
    "after_move:filepath", // printed after the file is finalized → last line
    "--no-simulate", // --print alone would only simulate; this makes it actually download
    url,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(ytDlp, args, { signal: opts?.signal });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text); // surface progress in MCP/CLI logs
    });
    child.on("error", (error) => reject(new Error(`Failed to run yt-dlp: ${error.message}`)));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed (exit ${code}):\n${stderr.trim() || "no output"}`));
        return;
      }
      const lines = stdout.trim().split(/\r?\n/);
      const filePath = lines.pop()?.trim();
      if (!filePath) {
        reject(new Error("yt-dlp did not report an output file."));
        return;
      }
      resolve({ filePath, title: lines.join(" ").trim() || undefined });
    });
  });
}
