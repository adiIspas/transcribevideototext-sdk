# @transcribevideototext/cli

Command-line interface for [VideoToText](https://www.transcribevideototext.com).

```bash
npm install -g @transcribevideototext/cli
transcribe login            # paste your vtt_… API key
transcribe ./interview.mp4 --diarize
transcribe https://example.com/talk.mp3 -l en > talk.txt
```

## Commands

| Command                        | Description                                                       |
| ------------------------------ | ----------------------------------------------------------------- |
| `transcribe login`             | Save your API key (`--key` or prompt).                            |
| `transcribe <file\|url>`       | Transcribe a local file or public URL (waits for the transcript). |
| `transcribe get <id>`          | Fetch a transcription by id.                                      |
| `transcribe list`              | List your transcriptions.                                         |
| `transcribe delete <id>`       | Delete a job (refunds if in progress).                            |
| `transcribe mcp`               | Print the MCP registration command for your AI agent.             |
| `transcribe whoami` / `logout` | Show / clear the saved key.                                       |

## Options for `transcribe <source>`

| Flag                    | Description                                       |
| ----------------------- | ------------------------------------------------- |
| `-l, --language <code>` | ISO 639-1 code or `auto` (default).               |
| `-d, --diarize`         | Separate and label speakers.                      |
| `--no-wait`             | Return the job id immediately (URL sources only). |
| `--timeout <seconds>`   | Max wait when waiting (default 600).              |
| `--json`                | Print the full transcription as JSON.             |

Transcript text is written to stdout; status and progress go to stderr, so `transcribe file.mp3 > out.txt` captures just the transcript.

The API key resolves in order: `--key` → `VTT_API_KEY` → saved config (`~/.config/transcribevideototext/config.json`).
