# OpenAPI Diff Room

On one live page, compare two OpenAPI 3.x specs: the agent auto-settles mechanical/no-decision noise; genuine breaking or ambiguous changes wait on the human; **no tool can approve a breaking change**; export migration notes only from what’s settled + human-acked.

Organizer pitch: *Agent clears noise in my OpenAPI diff; real breaking changes wait on me; I export the migration note.*

This is a client-only WebMCP demo for the OpenAI WebMCP Challenge (deadline 3 Sep 2026, 1pm PDT). It is **not** oasdiff parity — the classifier is a small, named rule table in [`src/diff/rules.ts`](src/diff/rules.ts) (~25 rules, Redline/oasdiff-inspired names).

## Live demo

- Public static: https://cdn.jsdelivr.net/gh/Arshgill01/openapi-diff-room@main/docs/index.html
- Mirror: https://raw.githack.com/Arshgill01/openapi-diff-room/main/docs/index.html
- Source: https://github.com/Arshgill01/openapi-diff-room

Locally:

```bash
npm install
npm test
npm run dev
```

Dev server: `http://127.0.0.1:4721`

## 60-second judge path

1. Open the live URL in **ChatGPT’s in-app browser**, or Chrome with `chrome://flags/#enable-webmcp-testing`.
2. Click **Load demo pair** (Petstore-like v1 vs v2).
3. Ask the agent:

   > Classify this OpenAPI diff and summarize what you settled vs what waits on me.

4. On one **waiting** card, click **Mark intentional (breaking)**.
5. Ask:

   > list_room then export_migration_notes.

6. Export **refuses** while any waiting cards remain. After the human settles every waiting card, export returns Markdown built only from auto-settled + human-acked cases.

Without WebMCP the same classify/export path works from on-page buttons. A banner appears if `document.modelContext` is missing.

## Example ChatGPT prompts

```
Load the demo OpenAPI pair, classify the diff, and tell me which cases you auto-settled versus which wait on me. Do not try to approve breaking changes.
```

```
Call list_room. If any cards are still waiting, tell me which ones need a human click. If the room is clear, export_migration_notes.
```

```
Focus the removed DELETE endpoint and quote the old vs new snippets. Do not settle it.
```

## What auto-settles vs what waits

Encoded in code, not prompts.

**Mechanical auto-settle** (green / safe bucket):

- Identical operations after JSON + local `$ref` normalize
- Property/key reorder with the same schema
- Description / summary / example / docs-only edits
- Adding optional request or response fields
- Adding new paths/operations (safe additive)

**Wait on the human** (cards — Take old / Take new / Mark intentional breaking):

- Removing a path or operation
- New required field or parameter
- Type / format / enum narrowing
- Removing a response field
- Description that uses MUST/SHALL/REQUIRED (ambiguous contract language)
- Other named breaking rules in `src/diff/rules.ts`

Waiting cards can be settled **only** from those three UI buttons. There is no `approve_break`, `take_new`, or `resolve_waiting` tool.

## WebMCP tools

Registered with `document.modelContext.registerTool` (fallback `navigator.modelContext`), `AbortSignal` lifecycle, JSON Schema, and `readOnlyHint` / `untrustedContentHint`. Each tool returns `{ content: [{ type: "text", text }] }` with structured JSON text.

| Tool | Role |
| --- | --- |
| `get_room_state` | Counts + case ids/status + WebMCP present? |
| `set_specs` | `fixture: "demo"` or two YAML/JSON strings (≤200KB). Clears room and reclassifies. |
| `classify_diff` | Run classifier. Idempotent if specs unchanged. |
| `focus_case` | Highlight a case (`path` + `method` or `caseId`). |
| `list_room` | Full room for polling after human decisions. |
| `export_migration_notes` | Markdown from settled + acked only. Refuses if waiting remain. |

## Stack

Vite, TypeScript, React, client-only. Optional `localStorage` for the last session. Static hosting (Netlify / GitHub Pages). MIT license.

## Deploy

```bash
npm run build
# Netlify
npx netlify deploy --prod --dir=dist
# or any static host of the dist/ folder
```

`netlify.toml` sets `npm run build` and SPA fallback. Add `.netlify` is gitignored.

This classifier is a demo-sized rule table. Do not claim oasdiff coverage.

## Devpost blurb

See [DEVPOST.md](DEVPOST.md).
