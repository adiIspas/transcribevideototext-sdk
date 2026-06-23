# @transcribevideototext/mcp-server

Model Context Protocol server for [VideoToText](https://www.transcribevideototext.com) — transcribe audio and video from Claude Code, Cursor, Codex, or Claude Desktop.

## Claude Code

```bash
claude mcp add vtt -e VTT_API_KEY=vtt_… -- npx -y @transcribevideototext/mcp-server
```

Then ask: _"Transcribe ./interview.mp4 with speaker labels."_ — or paste a link: _"Summarize the main ideas from https://www.youtube.com/watch?v=…"_

## Transcribe from a link

Paste a `url` into `transcribe` and it's handled one of two ways:

- **A page from a video or social site** — YouTube, X, LinkedIn, TikTok, Facebook, Instagram, Vimeo, and hundreds of other sites — is downloaded **on your own machine** first (so it uses your IP, avoiding the datacenter blocking that breaks server-side extraction), then uploaded and transcribed. The downloader is fetched automatically on first use (~30 MB, cached); audio is preferred to keep downloads small.
- **A direct media link** (a URL ending in a media file like `.mp3` or `.mp4`) is fetched server-side, with no local download.

In short: if your link points straight at an audio/video file, it's pulled by the API; any other link is downloaded locally first. This local download happens only with the **local (stdio) server** below — the hosted remote server fetches every `url` server-side.

> Public content only. Gated, private, or age-restricted posts (which require a login) are not supported.

## Other clients

Add to your MCP config (Cursor, Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "vtt": {
      "command": "npx",
      "args": ["-y", "@transcribevideototext/mcp-server"],
      "env": { "VTT_API_KEY": "vtt_…" }
    }
  }
}
```

Get an API key from the dashboard → **Developers → API Keys**.

## Tools

| Tool                   | Description                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `transcribe`           | Transcribe a `url` (direct media, or a YouTube/X/LinkedIn link downloaded locally), local `filePath`, or `storagePath`. Waits for the transcript by default. |
| `get_transcription`    | Fetch a job's status + result by id.                                                                                                                         |
| `list_transcriptions`  | List the account's transcriptions.                                                                                                                           |
| `delete_transcription` | Delete a job (refunds if in progress).                                                                                                                       |
| `create_upload_url`    | Advanced: sign an upload URL to PUT bytes yourself.                                                                                                          |

## Environment

| Var           | Description                     |
| ------------- | ------------------------------- |
| `VTT_API_KEY` | Required. Your `vtt_…` API key. |
