# @transcribevideototext/client

## 0.2.0

### Minor Changes

- 24f611f: Transcribe directly from YouTube, X, and LinkedIn links. The `transcribe` tool now detects
  platform links and downloads them locally with yt-dlp (auto-fetched and cached on first use,
  audio preferred), then uploads and transcribes — using the caller's own IP to avoid the
  datacenter blocking that breaks server-side extraction. Direct media URLs are still fetched
  server-side. Public content only.

  Adds `uploadFromLink` and `isExtractableUrl` to `@transcribevideototext/client/node`.
