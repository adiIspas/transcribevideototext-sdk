/**
 * @transcribevideototext/cli — the `transcribe` command.
 *
 * Thin wrapper over @transcribevideototext/client: authenticate once, then transcribe
 * local files or public URLs, list/get/delete jobs, and print the MCP install command.
 * Transcript text goes to stdout; status/progress goes to stderr so output can be piped.
 */

import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import {
  createClient,
  VideoToTextError,
  type Transcription,
  type VideoToTextClient,
} from "@transcribevideototext/client";
import { transcribeFile } from "@transcribevideototext/client/node";
import { clearConfig, configPath, maskKey, readConfig, resolveAuth, writeConfig } from "./config";

const VERSION = "0.1.0";

function info(message: string): void {
  process.stderr.write(`${message}\n`);
}

function die(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

/** Build a client from the resolved key, or exit with guidance if none is set. */
async function clientFromAuth(flagKey?: string): Promise<VideoToTextClient> {
  const auth = await resolveAuth(flagKey);
  if (!auth) {
    die("No API key found. Run `transcribe login`, set VTT_API_KEY, or pass --key.");
  }
  return createClient({ apiKey: auth.apiKey, baseUrl: auth.baseUrl });
}

function transcriptText(t: Transcription): string {
  if (t.segments.length === 0) return t.error ?? "";
  return t.segments.map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text)).join("\n");
}

function printResult(t: Transcription, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(t, null, 2)}\n`);
    return;
  }
  info(
    `Status: ${t.status}${t.language ? ` · ${t.language}` : ""}${t.durationSeconds != null ? ` · ${t.durationSeconds}s` : ""}`,
  );
  if (t.locked) {
    info(
      "⚠️  Result is locked to a preview (exceeds available minutes). Add credits, then `transcribe get " + t.id + "`.",
    );
  }
  if (t.status === "failed") die(t.error ?? "Transcription failed.");
  process.stdout.write(`${transcriptText(t)}\n`);
}

function isUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

async function runErrors(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof VideoToTextError) die(`${error.code}: ${error.message}`);
    die((error as Error).message);
  }
}

const program = new Command();
program.name("transcribe").description("Transcribe audio and video from the command line.").version(VERSION);

program
  .command("login")
  .description("Save your API key for future commands.")
  .option("--key <key>", "API key (vtt_…). If omitted, you will be prompted.")
  .action(async (opts: { key?: string }) => {
    await runErrors(async () => {
      let apiKey = opts.key ?? process.env.VTT_API_KEY;
      if (!apiKey) {
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        apiKey = (await rl.question("Paste your API key (vtt_…): ")).trim();
        rl.close();
      }
      if (!apiKey) die("No API key provided.");

      // Validate the key with a cheap authenticated call before persisting it.
      const config = await readConfig();
      const client = createClient({ apiKey, baseUrl: config.baseUrl });
      await client.listTranscriptions({ perPage: 1 });

      await writeConfig({ ...config, apiKey });
      info(`Saved ${maskKey(apiKey)} to ${configPath()}`);
    });
  });

program
  .command("logout")
  .description("Remove the saved API key.")
  .action(async () => {
    await clearConfig();
    info("Logged out.");
  });

program
  .command("whoami")
  .description("Show the active API key and where it came from.")
  .action(async () => {
    const auth = await resolveAuth();
    if (!auth) die("Not logged in. Run `transcribe login`.");
    info(`${maskKey(auth.apiKey)} (from ${auth.source})`);
  });

program
  .command("run <source>", { isDefault: true })
  .description("Transcribe a local file path or a public URL.")
  .option("--key <key>", "Override the API key for this call.")
  .option("-l, --language <code>", "Spoken-language ISO 639-1 code or 'auto' (default).")
  .option("-d, --diarize", "Separate and label speakers.")
  .option("--no-wait", "Return the job id immediately instead of waiting for the transcript.")
  .option("--timeout <seconds>", "Max seconds to wait when waiting (default 600).", "600")
  .option("--json", "Print the full transcription as JSON.")
  .action(
    async (
      source: string,
      opts: { key?: string; language?: string; diarize?: boolean; wait: boolean; timeout: string; json?: boolean },
    ) => {
      await runErrors(async () => {
        const client = await clientFromAuth(opts.key);
        const timeoutMs = Number(opts.timeout) * 1000;
        const onPoll = opts.json ? undefined : (t: Transcription) => info(`  …${t.status}`);

        if (!opts.wait) {
          const input = isUrl(source) ? { url: source } : null;
          if (!input) {
            die("--no-wait requires a URL source (local files need to finish uploading). Omit --no-wait for files.");
          }
          const created = await client.createTranscription({
            ...input,
            language: opts.language,
            diarize: opts.diarize,
          });
          process.stdout.write(`${created.id}\n`);
          info(`Job created (status: ${created.status}). Fetch it with: transcribe get ${created.id}`);
          return;
        }

        info(isUrl(source) ? `Transcribing ${source} …` : `Uploading and transcribing ${source} …`);
        const result = isUrl(source)
          ? await client.transcribeAndWait(
              { url: source, language: opts.language, diarize: opts.diarize },
              { timeoutMs, onPoll },
            )
          : await transcribeFile(client, source, {
              language: opts.language,
              diarize: opts.diarize,
              timeoutMs,
              onPoll,
            });
        printResult(result, Boolean(opts.json));
      });
    },
  );

program
  .command("list")
  .description("List your transcriptions.")
  .option("--key <key>", "Override the API key for this call.")
  .option("-p, --page <n>", "Page number.", "1")
  .option("--per-page <n>", "Items per page (max 50).", "20")
  .option("--json", "Print as JSON.")
  .action(async (opts: { key?: string; page: string; perPage: string; json?: boolean }) => {
    await runErrors(async () => {
      const client = await clientFromAuth(opts.key);
      const { items, total } = await client.listTranscriptions({
        page: Number(opts.page),
        perPage: Number(opts.perPage),
      });
      if (opts.json) {
        process.stdout.write(`${JSON.stringify({ items, total }, null, 2)}\n`);
        return;
      }
      info(`${items.length} of ${total} transcription(s):`);
      for (const t of items) {
        const duration = t.durationSeconds != null ? ` · ${t.durationSeconds}s` : "";
        process.stdout.write(`${t.id}  ${t.status.padEnd(10)}  ${t.fileName}${duration}\n`);
      }
    });
  });

program
  .command("get <id>")
  .description("Fetch a transcription by id.")
  .option("--key <key>", "Override the API key for this call.")
  .option("--json", "Print the full transcription as JSON.")
  .action(async (id: string, opts: { key?: string; json?: boolean }) => {
    await runErrors(async () => {
      const client = await clientFromAuth(opts.key);
      printResult(await client.getTranscription(id), Boolean(opts.json));
    });
  });

program
  .command("delete <id>")
  .alias("rm")
  .description("Delete a transcription (refunds if in progress).")
  .option("--key <key>", "Override the API key for this call.")
  .action(async (id: string, opts: { key?: string }) => {
    await runErrors(async () => {
      const client = await clientFromAuth(opts.key);
      await client.deleteTranscription(id);
      info(`Deleted ${id}.`);
    });
  });

program
  .command("mcp")
  .description("Print the MCP server registration command for your AI agent.")
  .action(async () => {
    const auth = await resolveAuth();
    const key = auth?.apiKey ?? "vtt_…";
    info("Register the MCP server with Claude Code:\n");
    process.stdout.write(`claude mcp add vtt -e VTT_API_KEY=${key} -- npx -y @transcribevideototext/mcp-server\n`);
    if (!auth) info("\n(Run `transcribe login` first, then re-run this to embed your key.)");
  });

program.parseAsync().catch((error: unknown) => die((error as Error).message));
