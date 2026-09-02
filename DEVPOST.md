# Devpost — OpenAPI Diff Room

**Tagline:** Agent clears noise in my OpenAPI diff; real breaking changes wait on me; I export the migration note.

## Elevator pitch

OpenAPI Diff Room is a single live page where two OpenAPI 3.x specs are classified into a shared room: mechanical edits auto-settle, breaking and ambiguous changes wait on a human, and **no registered WebMCP tool can pick a breaking side**. Migration notes export only from settled + human-acked cases. If `document.modelContext` is missing, the same classify/export path still works from buttons.

## What it does

- Loads a Petstore-like demo pair (description noise, property reorder, optional field, new path, removed endpoint, new required query, enum narrowing, MUST-in-description).
- Runs a named rule table (`src/diff/rules.ts`, ~25 rules, oasdiff/Redline-inspired — not parity).
- Puts auto-settled cases in green lists and waiting cases on cards with **Take old**, **Take new**, and **Mark intentional (breaking)**.
- Registers six WebMCP tools: `get_room_state`, `set_specs`, `classify_diff`, `focus_case`, `list_room`, `export_migration_notes`.
- `list_room` lets an agent poll after the human decides. `export_migration_notes` refuses with `export_refused` while waiting cards remain.

## Built with

- Vite + TypeScript + React (client-only)
- `document.modelContext.registerTool` (WebMCP imperative API)
- js-yaml for OpenAPI YAML
- Vitest for classifier rules
- Static deploy (Netlify / GitHub Pages)

## Judge path (60s)

1. Open the live HTTPS URL in ChatGPT’s in-app browser or Chrome `#enable-webmcp-testing`.
2. Load demo pair.
3. “Classify this OpenAPI diff and summarize what you settled vs what waits on me.”
4. Human: Mark intentional on one waiting card.
5. “list_room then export_migration_notes.”
6. Export succeeds only after waiting cards are cleared.

## Refusal is the product

Agents can classify, focus, list, and export. They cannot approve a break. That is the demo.
