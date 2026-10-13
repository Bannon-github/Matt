# Matt — video conversations

A local preview of a recorded-video archive with timestamped transcripts, an online AI evidence selector, optional browser speech, and the Declaration of Sovereign Conscientity.

## Run

Requires Node.js 24+. No npm dependencies or frontend build step.

```powershell
./Start-Matt.ps1
```

Or run `npm start` with Node on PATH. Visit http://127.0.0.1:4173. The server binds only to loopback. Stop with Ctrl+C. The launcher also locates the bundled Codex Node runtime on this Windows machine.

## Local media and publication

The two confirmed source files remain in the owner's Videos folder. `.local/catalog.json` points to them; neither footage nor transcripts are committed. `.env`, logs, media, and `.local/` are ignored. Local preview allows inspection of unapproved content. `content/catalog.json` is deliberately empty.

Nothing has been published, pushed, or committed. Obtain the owner's explicit approval of the particular footage before publication, review the automatic transcript and the cut-off ending, and verify rights to visuals, likeness, voice, and any music. The generated clip is 10.005 seconds; the abstract recording is 11.866633 seconds. Do not call either live or impersonate anyone depicted.

For a later deployment, create a reviewed public catalog using the same schema as `.local/catalog.json`; set `publicationApproved` and `transcriptReviewed` true only after review and user approval. Configure media paths on the server. Production mode reads ONLY `content/catalog.json`, omits unapproved entries, and requires `PUBLIC_ORIGIN`. Host this Node application behind HTTPS with persistent storage; static GitHub Pages cannot run the AI or analytics endpoints. Do not expose local preview through a tunnel.

## Connect online AI later

The owner chose to finish the preview before connecting AI. Enter an OpenAI API key privately in `.env` (see `.env.example`), then restart. Never paste credentials into chat or frontend code. `OPENAI_MODEL` defaults to `gpt-4.1-mini`; confirm account access when connecting.

The server shortlists timestamped transcript passages (all passages fit for this small archive), asks OpenAI's Responses API to select supported passage IDs with a strict schema, validates IDs, then returns exact server-owned transcript quotes and timestamps. The model cannot write factual prose into the answer. It can still select a passage incorrectly; live answer-quality evaluation remains necessary. Uncertain final speech is displayed for review but excluded from retrieval. The silent source has no fabricated speech. Questions that need more material are declined. Each question is evaluated independently; implicit follow-ups should restate their subject.

Only question text and candidate transcript text are sent to OpenAI; no video, analytics, IP addresses, or audio files are sent by the chat endpoint. `store:false` is used; it is not a claim of zero provider retention. Chat is not persisted locally. Read [OpenAI's structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs) for the response contract.

Microphone input uses browser SpeechRecognition when available and requires the visitor's action/permission. It fills an editable draft, never submits automatically. Browser speech services may process audio remotely. Speech synthesis uses the browser's ordinary voice, not a clone. Unsupported browsers keep typed input available.

## Declaration and analytics

`content/declaration.md` preserves the exact completed text from **Declaration Revision**, conversation `6ac80f21-d7d0-83e8-80c6-6bcf4b97c9dc`, assistant message `5f94520a-0f8b-58db-b9d8-3d904d9e5772`.

The homepage includes its link within a paragraph. Native `dialog.showModal()` makes the background inert, contains keyboard navigation, and restores focus on close. Backdrop is 94% black with a fade and reduced-motion support. Escape and the Close button close it.

SQLite stores open and close events with server timestamps, socket IP, user agent, language, client-reported time, timezone, viewport, visibility, and visible reading duration. No fingerprinting or geolocation is added. Logs are private server files, not web routes. No public analytics dashboard is exposed. Count requires a matching session-bound open and close, at least 5 seconds active and elapsed time, no more than 30 minutes elapsed, and a plausible active duration. Duplicate closes cannot increment the count. Hidden tabs pause the client clock. Closing/navigation uses a keepalive request; missing delivery never counts. This validates event pairing, not proof of a human reading or bot prevention. Sessions expire after one hour and are lost on server restart. Invalid/orphan/duplicate closes remain event records.

Retention is 30 days, pruned hourly while the server runs, on startup, and on new opens. Network peer IP is recorded; forwarded headers are intentionally untrusted. Behind a reverse proxy it will be the proxy IP until a trusted-proxy policy is implemented for that deployment. The footer discloses collection. These defaults should be reviewed with the owner before public launch.

## Verification

```sh
npm test
npm run check
npm run test:ai
```

Unit/integration tests cover paired counts, durations, duplicate/wrong-session/missing/expired closes, retention, exact-source citations, unsupported or invented evidence, silent sources, provider failures, HTTP origin/CSRF checks, range playback, private files, and publication gating. `test:ai` requires a real key and calls the online service; it is deliberately not run for the disconnected preview.

Browser QA uses the Codex in-app browser: desktop/mobile rendering, both media files loading, transcript-to-clip playback, an isolated clearly labeled fixture for answer-to-clip playback, disconnected service behavior, modal Escape/focus restoration, and stored event pairing. Physical microphone capture, speaker output, real AI answers, external deployment, and a full owner rights review remain unverified.

## Add material

Each catalog video has a unique ID, title, duration, local file path, disclosure/description, review flags, and timestamped segments. Each segment has a unique ID within its video, start/end seconds, exact text, and optional `retrievable:false` for uncertain speech. Validate times against the real recording. Add new material locally first, review it, test questions, then request publication approval. Longer archives may need semantic retrieval instead of the current lexical shortlist.
