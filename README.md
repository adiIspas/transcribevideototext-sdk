# transcribevideototext-sdk

Official client, CLI, and MCP server for the [VideoToText](https://www.transcribevideototext.com)
transcription API. All three are thin clients of the public REST API and authenticate with the
same `vtt_` API key.

| Package                                                    | Install                                 | What it is                                 |
| ---------------------------------------------------------- | --------------------------------------- | ------------------------------------------ |
| [`@transcribevideototext/client`](packages/client)         | `npm i @transcribevideototext/client`   | Typed JS/TS client.                        |
| [`@transcribevideototext/cli`](packages/cli)               | `npm i -g @transcribevideototext/cli`   | The `transcribe` command.                  |
| [`@transcribevideototext/mcp-server`](packages/mcp-server) | `npx @transcribevideototext/mcp-server` | MCP server for Claude Code, Cursor, Codex. |

Get an API key from the dashboard → **Developers → API Keys**.

## Quick start

```bash
# CLI
npm install -g @transcribevideototext/cli
transcribe login
transcribe ./interview.mp4 --diarize

# MCP (Claude Code)
claude mcp add vtt -e VTT_API_KEY=vtt_… -- npx -y @transcribevideototext/mcp-server
```

```ts
// Client
import { createClient } from "@transcribevideototext/client";

const client = createClient({ apiKey: process.env.VTT_API_KEY! });
const result = await client.transcribeAndWait({ url: "https://example.com/podcast.mp3" });
console.log(result.segments.map((s) => s.text).join(" "));
```

## Development

```bash
pnpm install
pnpm build        # builds all three (client first)
pnpm typecheck
pnpm lint
```

## Release

The three packages version in lockstep via [Changesets](.changeset).

```bash
pnpm changeset          # describe a change
pnpm version-packages   # bump versions
pnpm release            # build + publish to npm
```
