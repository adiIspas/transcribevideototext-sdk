# @transcribevideototext/client

## 0.3.0

### Minor Changes

- 3ada72f: Transcribe links from any site the bundled downloader supports, not just YouTube/X/LinkedIn. Any URL that isn't a direct media file (`.mp3`, `.mp4`, …) is now downloaded locally first, while direct media links are still fetched server-side. Docs and the MCP `transcribe` tool instructions clarify the two cases.

## 0.2.0

### Minor Changes

- 24f611f: Transcribe directly from YouTube, X, and LinkedIn links. The `transcribe` tool now detects
  platform links and downloads them locally with yt-dlp (auto-fetched and cached on first use,
  audio preferred), then uploads and transcribes — using the caller's own IP to avoid the
  datacenter blocking that breaks server-side extraction. Direct media URLs are still fetched
  server-side. Public content only.

  Adds `uploadFromLink` and `isExtractableUrl` to `@transcribevideototext/client/node`.
