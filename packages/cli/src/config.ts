/**
 * Local credential store for the CLI.
 * Persists the API key (and optional base URL) at $XDG_CONFIG_HOME/transcribevideototext/config.json,
 * resolving the active key with precedence: explicit flag > VTT_API_KEY env > stored config.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CliConfig {
  apiKey?: string;
  baseUrl?: string;
}

function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "transcribevideototext");
}

function configPath(): string {
  return join(configDir(), "config.json");
}

export async function readConfig(): Promise<CliConfig> {
  try {
    return JSON.parse(await readFile(configPath(), "utf8")) as CliConfig;
  } catch {
    return {};
  }
}

export async function writeConfig(config: CliConfig): Promise<void> {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export async function clearConfig(): Promise<void> {
  await rm(configPath(), { force: true });
}

export interface ResolvedAuth {
  apiKey: string;
  baseUrl?: string;
  source: "flag" | "env" | "config";
}

/** Resolve the active API key, or null if none is configured. */
export async function resolveAuth(flagKey?: string): Promise<ResolvedAuth | null> {
  const config = await readConfig();
  const baseUrl = process.env.VTT_API_BASE_URL ?? config.baseUrl;
  if (flagKey) return { apiKey: flagKey, baseUrl, source: "flag" };
  const envKey = process.env.VTT_API_KEY ?? process.env.TRANSCRIBEVIDEOTOTEXT_API_KEY;
  if (envKey) return { apiKey: envKey, baseUrl, source: "env" };
  if (config.apiKey) return { apiKey: config.apiKey, baseUrl, source: "config" };
  return null;
}

export function maskKey(key: string): string {
  return key.length <= 12 ? key : `${key.slice(0, 8)}…${key.slice(-4)}`;
}

export { configPath };
