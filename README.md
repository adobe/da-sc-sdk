# da-sc-sdk

A headless SDK for working with **DA Structured Content** — schema-constrained JSON documents serialized as a defined HTML wire format. It exposes a small, focused API covering the operations supported today.

The SDK is pure ESM and ships with no DOM dependencies and no I/O. UI rendering, transport, and persistence are intentionally left to the consuming application.

In exchange, every tool built on the SDK shares the same DA Structured Content behavior — defined here once and used across all consumers, instead of being re-implemented (and inevitably drifting) in each tool.

## Status

**Pre-release.** This SDK is being stabilized for its first npm publication. The public API is in active development; expect possible breaking changes and no support commitments before the official release.

## Install

> **Not yet on npm.** The package name and version in `package.json` are placeholders — do not publish. Until the first release, use the temporary alternative below.

Build and vendor the bundle:

```bash
git clone https://github.com/adobe-rnd/da-sc-sdk.git
cd da-sc-sdk && npm install && npm run build
# → dist/index.js (self-contained ESM bundle)
```

```js
import {
  createEngine,
  convertJsonToHtml,
} from "./deps/da-sc-sdk/dist/index.js";
```

## Quick start

```js
import { createEngine, convertJsonToHtml } from "da-sc-sdk";

const schema = {
  type: "object",
  title: "Project",
  required: ["name"],
  properties: {
    name: { type: "string", title: "Name" },
    tags: {
      type: "array",
      title: "Tags",
      items: { type: "string", title: "Tag" },
    },
  },
};

const engine = createEngine({
  schema,
  document: { metadata: { schemaName: "project" }, data: {} },
  onChange: () => {
    /* state changed — read engine.getState() */
  },
});

engine.setField("/data/name", "Alice");
engine.addItem("/data/tags");
engine.setField("/data/tags/0", "demo");

const { html } = convertJsonToHtml({ json: engine.getState().document });
// `html` is ready to POST. Persistence is your job.
```

Runnable scripts in [examples/](./examples/).

## API

Five top-level functions:

| Function            | Purpose                                              | Returns                           |
| ------------------- | ---------------------------------------------------- | --------------------------------- |
| `createEngine`      | Stateful editing (UI editors, agents holding state). | `Engine`                          |
| `validateSchema`    | Lint a schema before binding to it.                  | `{ valid, schemaIssues }`         |
| `validateData`      | Check data against a schema.                         | `{ valid, errors, schemaIssues }` |
| `convertJsonToHtml` | Convert JSON → DA wire-format HTML.                  | `{ html } \| { error }`           |
| `convertHtmlToJson` | Convert DA HTML → JSON.                              | `{ json } \| { error }`           |

`createEngine` compiles a schema + initial document into a stateful, mutable handle.

**What it offers:**

- Pointer-addressed mutations (`setField`, `addItem`, `insertItem`, `removeItem`, `moveItem`) that update immutably and re-validate atomically.
- Schema defaults materialized into the initial document.
- `onChange` fires exactly once per real mutation. Setting a field to its current value is a no-op and does not fire `onChange`.

**Use it when** you edit a document over time — interactive editors, agents holding state across turns, anything where the document survives between operations.

The handle exposes six methods. All synchronous, all addressed by RFC 6901 JSON Pointer:

| Method                        | Purpose                              |
| ----------------------------- | ------------------------------------ |
| `getState()`                  | Read the current state snapshot.     |
| `setField(pointer, value)`    | Set a primitive value at `pointer`.  |
| `addItem(pointer)`            | Append to the array at `pointer`.    |
| `insertItem(pointer)`         | Insert before the item at `pointer`. |
| `removeItem(pointer)`         | Remove the item at `pointer`.        |
| `moveItem(pointer, from, to)` | Reorder an array item.               |

Every real mutation triggers `onChange`; the return value is the engine's current state after the call. `onChange` does **not** fire at construction — read the initial state via `getState()`. To start over with a different `(schema, document)`, create a new engine.

## Usage

### Validate

```js
import { validateSchema, validateData } from "da-sc-sdk";

validateSchema({ schema });
// → { valid, schemaIssues }

validateData({ schema, data });
// → { valid, errors, schemaIssues }
```

`errors` is a pointer-keyed map; `errors[pointer]?.message` is O(1). Each entry exposes `keyword`, `instancePath`, `params`, and `message` fields. `valid` is `true` only when both `schemaIssues` and `errors` are empty — you can't claim a document is valid against a broken schema.

### Convert (JSON ↔ HTML)

```js
import { convertJsonToHtml, convertHtmlToJson } from "da-sc-sdk";

const { html } = convertJsonToHtml({
  json: { metadata: { schemaName: "project" }, data: { name: "Alice" } },
});

const { json } = convertHtmlToJson({ html });
```

`convertHtmlToJson` returns `{ error: "<reason>" }` on empty or malformed input.

### Edit (with persistence)

The engine has no transport and no save status. Wire your own persistence on top of `onChange`:

```js
let engine;
let lastValues;
engine = createEngine({
  schema,
  document,
  onChange: () => {
    const next = engine.getState().document;
    if (next === lastValues) return; // skip non-mutation transitions
    lastValues = next;
    // convert via convertJsonToHtml, POST, IndexedDB-cache — whatever fits
  },
});
lastValues = engine.getState().document; // onChange does NOT fire at init
```

[docs/headless-consumer.md](docs/headless-consumer.md) has a ~40-line single-flight save pattern with status tracking.

## Error handling

The SDK reports validation, conversion, and mutation failures through return values rather than exceptions. Truly invalid arguments (wrong types, malformed pointers) may still surface as runtime errors.

- **Validators** (`validateSchema`, `validateData`) — check `result.valid`. When `false`, inspect `result.schemaIssues` for schema-level problems and `result.errors` for data-level problems (the latter is a `{ [pointer]: ValidationError }` map).
- **Converters** (`convertJsonToHtml`, `convertHtmlToJson`) — destructure with a fallback: `const { html, error } = convertJsonToHtml(...)`. The `error` field is set on empty or malformed input; otherwise the success field (`html` or `json`) is set.
- **Engine** — if the schema is malformed, `createEngine` still returns a handle but `getState().schemaIssues` will be non-empty and mutations no-op. Check `schemaIssues.length === 0` before relying on the engine.

## TypeScript

Type declarations ship in `index.d.ts` — no separate `@types/*` install needed.

```ts
import type {
  Engine,
  EditorState,
  Document,
  JsonPointer,
  SchemaIssue,
  ErrorsByPointer,
  ValidationError,
} from "da-sc-sdk";
```

## Runtime support

- ES2022 + ESM. No Node built-ins, no DOM.
- Node ≥18 and modern browsers.
- One runtime dependency: [hast-util-from-html](https://www.npmjs.com/package/hast-util-from-html).

## Design

- **Headless.** No UI, no DOM, no rendering. UIs subscribe to `onChange`.
- **No I/O.** No fetch, no file system, no DA endpoints. Callers wire their own transport.
- **Five named exports.** The `package.json` `exports` map blocks deep imports. The five exports are the entire public API and the intended semver boundary.
- **Strict schema subset.** A strict subset of JSON Schema 2020-12 — see [docs/schema-spec.md](docs/schema-spec.md). Anything outside that contract surfaces in `schemaIssues`.
- **Not** for general JSON Schema validation.

## Development

Inside the repo:

- `npm install` — install dev dependencies
- `npm test` — run the test suite (Web Test Runner)
- `npm run lint` / `npm run lint:fix` — lint
- `npm run build` — produce `dist/index.js`

## Internals

For contributors and anyone going deeper than the public API — layout, lifecycle, schema/model builders, and the headless consumer pattern — see [docs/](./docs/).

## License

Apache-2.0 © Adobe Inc.
