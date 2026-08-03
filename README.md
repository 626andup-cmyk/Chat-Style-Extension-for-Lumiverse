# Symmetrical Multi-Message Simulator (Lumiverse / Spindle extension)

Queue multiple outgoing messages before sending (30s auto-flush, extended by typing),
and split AI replies containing `<cht>` tags into staggered bubbles.

## Status: fully confirmed

Every piece of this extension has now been checked directly against the real
Lumiverse docs (or a real published extension's source):

- Manifest schema — `docs.lumiverse.chat/getting-started/manifest/`
- `ctx.messages.registerTagInterceptor`, `ctx.dom.*` — `frontend-api/message-tags/`, `frontend-api/dom-helper/`
- `ctx.ui.mount('input-bar')` — `frontend-api/ui-placement/`
- `spindle.chat.appendMessage(..., { triggerGeneration: true })` — `backend-api/chat-mutation/`
- `spindle.on('CHAT_SWITCHED', ...)` — `backend-api/events/#chat-lifecycle`

Active-chat tracking lives entirely in `src/backend.ts` via `CHAT_SWITCHED`
(`{ chatId: string | null }`, `null` when the user is on the home screen).
The frontend doesn't track or send a chatId at all — it just fires the
flush and lets the backend resolve where it goes.

## Project layout

```
spindle.json       — extension manifest
src/frontend.ts     — queue UI (button, popover, timer) + <cht> staggering
src/backend.ts      — receives the flushed queue, appends + generates
dist/               — build output (entry_frontend / entry_backend point here)
```

## Building

This repo ships source only — Lumiverse expects compiled output in `dist/`.
Set up a bundler (esbuild is the lightest option) per the
[TypeScript Setup](https://docs.lumiverse.chat/getting-started/typescript-setup/)
doc, e.g.:

```bash
npm install --save-dev esbuild
npx esbuild src/frontend.ts --bundle --outfile=dist/frontend.js --format=esm
npx esbuild src/backend.ts --bundle --outfile=dist/backend.js --format=esm --platform=node
```

Commit the built `dist/` files so Lumiverse can install straight from the
repo (this is the pattern used by published Spindle extensions).

## Installing into Lumiverse

Settings → Extensions → Install from Source → paste your repo URL, e.g.

```
https://github.com/<your-username>/lumiverse-multi-message-tester
```

Approve the requested permissions (`chat_mutation`, `generation`, `chats`),
enable the extension, and open a chat to test.

## Known limitation

`<cht>` chunks render as staggered sub-bubbles appended *inside* the AI's
existing message bubble, not as fully separate chat entries — the public
Spindle API doesn't expose a way to suppress the host's own bubble
rendering and substitute a custom one.
