/**
 * @transcribevideototext/mcp-server
 *
 * A stdio Model Context Protocol server that exposes the VideoToText transcription
 * API as tools. Authenticates with an API key from the `VTT_API_KEY` env var and
 * delegates all logic to @transcribevideototext/client — no business logic lives here.
 *
 * Register with Claude Code:
 *   claude mcp add vtt -e VTT_API_KEY=vtt_… -- npx -y @transcribevideototext/mcp-server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient, VideoToTextError, type VideoToTextClient } from "@transcribevideototext/client";
import { isExtractableUrl, uploadFile, uploadFromLink } from "@transcribevideototext/client/node";
import { z } from "zod";
import { formatList, formatTranscription } from "./format";

const VERSION = "0.1.0";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function text(value: string): ToolResult {
  return { content: [{ type: "text", text: value }] };
}

function failure(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Build the client lazily so the server still starts (and reports a clear error) without a key. */
function getClient(): VideoToTextClient {
  const apiKey = process.env.VTT_API_KEY ?? process.env.TRANSCRIBEVIDEOTOTEXT_API_KEY;
  if (!apiKey) {
    throw new VideoToTextError(
      "unauthorized",
      401,
      "Missing API key. Set VTT_API_KEY (get one from the dashboard → Developers → API Keys).",
    );
  }
  return createClient({ apiKey, baseUrl: process.env.VTT_API_BASE_URL });
}

/** Wrap a handler so thrown VideoToTextErrors become readable tool errors instead of crashing the server. */
function handler<A>(fn: (client: VideoToTextClient, args: A) => Promise<ToolResult>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return await fn(getClient(), args);
    } catch (error) {
      if (error instanceof VideoToTextError) return failure(`${error.code}: ${error.message}`);
      return failure(`Unexpected error: ${(error as Error).message}`);
    }
  };
}

const server = new McpServer({ name: "transcribevideototext", version: VERSION });

server.registerTool(
  "transcribe",
  {
    title: "Transcribe audio or video",
    description:
      "Transcribe an audio/video file to text. Provide exactly ONE source: `url` (a public https link — " +
      "YouTube/X/LinkedIn and other supported sites are downloaded on this machine first; direct media links " +
      "are fetched server-side), `filePath` (an absolute path to a file on this machine — it is uploaded for " +
      "you), or `storagePath` (from a prior create_upload_url). By default this waits for the transcript and " +
      "returns the full text. Set `wait: false` to return immediately with a job id you can poll via " +
      "get_transcription.",
    inputSchema: {
      url: z
        .string()
        .url()
        .optional()
        .describe(
          "Public https URL. Platform links (YouTube, X, LinkedIn, …) are downloaded locally first; " +
            "direct media links are fetched server-side. Public content only — gated/private posts are not supported.",
        ),
      filePath: z.string().optional().describe("Absolute path to a local audio/video file on this machine."),
      storagePath: z.string().optional().describe("Storage path returned by create_upload_url."),
      language: z
        .string()
        .optional()
        .describe("Spoken-language ISO 639-1 code (e.g. 'en', 'es') or 'auto' to auto-detect. Defaults to auto."),
      diarize: z.boolean().optional().describe("Separate and label speakers in the transcript."),
      wait: z.boolean().optional().describe("Wait for completion and return the transcript (default true)."),
      timeoutSeconds: z
        .number()
        .int()
        .positive()
        .max(3600)
        .optional()
        .describe("Max seconds to wait when wait=true (default 600)."),
    },
  },
  handler<{
    url?: string;
    filePath?: string;
    storagePath?: string;
    language?: string;
    diarize?: boolean;
    wait?: boolean;
    timeoutSeconds?: number;
  }>(async (client, args) => {
    const sources = [args.url, args.filePath, args.storagePath].filter(Boolean);
    if (sources.length !== 1) {
      return failure("Provide exactly one source: `url`, `filePath`, or `storagePath`.");
    }

    const wait = args.wait !== false;
    const poll = { timeoutMs: (args.timeoutSeconds ?? 600) * 1000 };
    const { language, diarize } = args;

    // Local files and platform links (YouTube/X/LinkedIn/…) both resolve to a local upload
    // first; only direct media `url`s and `storagePath`s are handed straight to the API.
    if (args.filePath || (args.url && isExtractableUrl(args.url))) {
      const { path, fileName, contentType } = args.filePath
        ? await uploadFile(client, args.filePath)
        : await uploadFromLink(client, args.url!);
      const input = { storagePath: path, fileName, mediaType: contentType, language, diarize };
      if (wait) return text(formatTranscription(await client.transcribeAndWait(input, poll)));
      const created = await client.createTranscription(input);
      return text(`Job created: ${created.id} (status: ${created.status}). Poll get_transcription for the result.`);
    }

    const input = args.url
      ? { url: args.url, language, diarize }
      : { storagePath: args.storagePath, language, diarize };
    if (wait) return text(formatTranscription(await client.transcribeAndWait(input, poll)));
    const created = await client.createTranscription(input);
    return text(`Job created: ${created.id} (status: ${created.status}). Poll get_transcription for the result.`);
  }),
);

server.registerTool(
  "get_transcription",
  {
    title: "Get a transcription",
    description: "Fetch a transcription's status and result by id. Use this to poll a job created with wait=false.",
    inputSchema: { id: z.string().describe("The transcription id.") },
  },
  handler<{ id: string }>(async (client, args) => text(formatTranscription(await client.getTranscription(args.id)))),
);

server.registerTool(
  "list_transcriptions",
  {
    title: "List transcriptions",
    description: "List the account's transcriptions, most recent first.",
    inputSchema: {
      page: z.number().int().min(1).optional(),
      perPage: z.number().int().min(1).max(50).optional(),
    },
  },
  handler<{ page?: number; perPage?: number }>(async (client, args) => {
    const { items, total } = await client.listTranscriptions({ page: args.page, perPage: args.perPage });
    return text(formatList(items, total));
  }),
);

server.registerTool(
  "delete_transcription",
  {
    title: "Delete a transcription",
    description: "Delete a transcription by id. Cancels and refunds it if still in progress.",
    inputSchema: { id: z.string().describe("The transcription id to delete.") },
  },
  handler<{ id: string }>(async (client, args) => {
    await client.deleteTranscription(args.id);
    return text(`Deleted transcription ${args.id}.`);
  }),
);

server.registerTool(
  "create_upload_url",
  {
    title: "Create an upload URL",
    description:
      "Advanced: sign a short-lived upload URL for a file you will PUT yourself. Returns `path` to pass as " +
      "`storagePath` to transcribe. Most callers should use transcribe with `filePath` or `url` instead.",
    inputSchema: {
      fileName: z.string().describe("The file name, e.g. 'interview.mp4'."),
      contentType: z.string().describe("MIME type, e.g. 'video/mp4' or 'audio/mpeg'."),
    },
  },
  handler<{ fileName: string; contentType: string }>(async (client, args) => {
    const { path, signedUrl } = await client.createUploadUrl(args);
    return text(
      `Upload URL created.\nstoragePath: ${path}\nsignedUrl (PUT your bytes here, expires in 1h):\n${signedUrl}`,
    );
  }),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(`Fatal: ${(error as Error).message}\n`);
  process.exit(1);
});
