# @transcribevideototext/client

Typed client for the [VideoToText](https://www.transcribevideototext.com) transcription API.

```bash
npm install @transcribevideototext/client
```

```ts
import { createClient } from "@transcribevideototext/client";

const client = createClient({ apiKey: process.env.VTT_API_KEY! });

// One call: create a job from a public URL and wait for the transcript.
const result = await client.transcribeAndWait({
  url: "https://example.com/podcast.mp3",
  language: "auto",
  diarize: true,
});

console.log(result.status, result.segments.map((s) => s.text).join(" "));
```

## Local files (Node)

```ts
import { createClient } from "@transcribevideototext/client";
import { transcribeFile } from "@transcribevideototext/client/node";

const client = createClient({ apiKey: process.env.VTT_API_KEY! });
const result = await transcribeFile(client, "./interview.mp4", { diarize: true });
```

## API

| Method                 | Description                                   |
| ---------------------- | --------------------------------------------- |
| `createUploadUrl`      | Sign an upload URL.                           |
| `createTranscription`  | Create a job from `storagePath` or `url`.     |
| `getTranscription`     | Fetch a job's status + result.                |
| `listTranscriptions`   | List your transcriptions (paginated).         |
| `deleteTranscription`  | Delete a job (refunds if in progress).        |
| `uploadBytes`          | Sign + PUT bytes, returns `storagePath`.      |
| `waitForTranscription` | Poll a job until terminal.                    |
| `transcribeAndWait`    | Create + wait — the synchronous-feeling path. |

Errors are thrown as `VideoToTextError` with a stable `.code` and `.status`.
