# @transcribevideototext/mcp-server

Model Context Protocol server for [VideoToText](https://www.transcribevideototext.com) — transcribe audio and video from Claude Code, Cursor, Codex, or Claude Desktop.

## Claude Code

```bash
claude mcp add vtt -e VTT_API_KEY=vtt_… -- npx -y @transcribevideototext/mcp-server
```

Then ask: _"Transcribe ./interview.mp4 with speaker labels."_ — or paste a link: _"Summarize the main ideas from https://www.youtube.com/watch?v=…"_

## Transcribe from a link

`transcribe` accepts YouTube, X, and LinkedIn links (and [other yt-dlp-supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)). The media is downloaded **on your own machine** (so it uses your IP, avoiding the datacenter blocking that breaks server-side extraction), then uploaded and transcribed. yt-dlp is fetched automatically on first use (~30 MB, cached); audio is preferred to keep downloads small. Direct media URLs (e.g. an `.mp3` link) are still fetched server-side as before.

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

| Var                | Description                                               |
| ------------------ | --------------------------------------------------------- |
| `VTT_API_KEY`      | Required. Your `vtt_…` API key.                           |
| `VTT_API_BASE_URL` | Optional. Override the API base (defaults to production). |
