# da-sc-sdk

A headless SDK for **DA Structured Content** — a strict JSON Schema subset for forms-style documents. The SDK validates schemas, validates data against them, serializes documents to DA's wire-format HTML, and runs a stateful editor for interactive editing.

**No DOM. No I/O. No persistence.** The same five functions run identically in browsers, Node, Deno, Bun, Web Workers, Cloudflare Workers, and edge runtimes. Errors are [ajv](https://ajv.js.org)-shaped — agents trained on JSON Schema vocabulary already know how to read them.

**Who it's for:** UI editors that need a state machine, MCP servers that wrap document validation as tools, import pipelines that move data into DA HTML, Workers that validate incoming JSON. **Who it's not for:** general JSON Schema validation (use ajv) or non-DA HTML wire formats.

> Status: **early — the package name and version are placeholders.** Do not publish yet.

## What it provides

Five top-level functions, narrow on purpose. The SDK covers what's needed today for three use cases; nothing speculative.

| Use case                                                             | Function            |
| -------------------------------------------------------------------- | ------------------- |
| **Interactive editing** (UI editors, agents holding state)           | `createEngine`      |
| **Schema validation** (lint a schema before binding to it)           | `validateSchema`    |
| **Data validation** (check data against a schema)                    | `validateData`      |
| **JSON → HTML serialization** (import tools, agents writing content) | `convertJsonToHtml` |
| **HTML → JSON parsing** (importers reading saved content)            | `convertHtmlToJson` |

`createEngine({ schema, document, onChange })` returns an engine object that exposes 6 methods:

| Method                        | Purpose                              |
| ----------------------------- | ------------------------------------ |
| `getState()`                  | Read the current state snapshot.     |
| `setField(pointer, value)`    | Set a primitive value at `pointer`.  |
| `addItem(pointer)`            | Append to the array at `pointer`.    |
| `insertItem(pointer)`         | Insert before the item at `pointer`. |
| `removeItem(pointer)`         | Remove the item at `pointer`.        |
| `moveItem(pointer, from, to)` | Reorder an array item.               |

Every mutation method is synchronous, returns the new state, and triggers `onChange`. `createEngine` itself is synchronous and does **not** fire `onChange` at construction — read the initial state via `getState()`. All mutations are addressed by RFC 6901 JSON Pointer. To start over with a different (schema, document), create a new engine.

## Install

The package is not yet published to npm. Use one of the two paths below; both work today.

**Build and vendor `dist/index.js`** — a single self-contained ESM file (~87KB gzipped). Drop it into your consumer's `deps/` and import the relative path:

```bash
git clone <this repo>
cd da-sc-sdk
npm install
npm run build      # → dist/index.js
```

```js
// in your consumer
import { convertJsonToHtml } from "./deps/da-sc-sdk/dist/index.js";
const { html } = convertJsonToHtml({ json });
```

**Or import the source directly** if you're working inside a monorepo that has the SDK as a sibling:

```js
import { convertJsonToHtml } from "../../path/to/da-sc-sdk/src/index.js";
```

Once published the install will become `npm install da-sc-sdk` — the import path and the API are stable. TypeScript declarations ship in `index.d.ts`; no peer dependencies; pure ESM; same call works in any ES2022 + ESM runtime (browsers, Node ≥18, Deno, Bun, Web Workers, Cloudflare Workers, edge).

## Quick start

### Validate a schema

```js
import { validateSchema } from "da-sc-sdk";

const { valid, schemaIssues } = validateSchema({ schema: mySchema });
if (!valid) {
  console.error("Schema issues:", schemaIssues);
}
```

### Validate data against a schema

```js
import { validateData } from "da-sc-sdk";

const result = validateData({ schema, data: { name: "", status: "Unknown" } });
// → { valid: false,
//     errors: {
//       '/data/name': {
//         keyword: 'required', instancePath: '/data/name',
//         params: { missingProperty: 'name' },
//         message: 'This field is required.',
//       },
//       '/data/status': {
//         keyword: 'enum', instancePath: '/data/status',
//         params: { allowedValues: ['Draft', 'Active'] },
//         message: 'Must be one of the allowed options.',
//       },
//     },
//     schemaIssues: [] }
```

Both validators share `valid` + `schemaIssues`; `validateData` additionally exposes `errors` for data-level failures. `valid` is `true` iff `schemaIssues` AND `errors` are both empty — you can't claim a document is valid against a broken schema.

`errors` is a pointer-keyed map. UIs do `errors[pointer]?.message` (O(1)); agents iterate via `Object.values(errors)`. Per-entry shape mirrors [ajv](https://ajv.js.org) (`keyword`, `instancePath`, `params`, `message`) so the JSON Schema vocabulary an LLM already knows just works. Two deliberate deviations from ajv's full shape: `schemaPath` is omitted (it leaks schema structure), and `required` errors land on the **child** pointer (where the missing field would be) rather than the parent — so consumers can look up errors by `instancePath` without pointer arithmetic. `schemaIssues` fires when the **schema** itself has problems; `errors` fires when the **data** doesn't satisfy the (well-formed) schema.

### Serialize JSON to DA HTML

```js
import { convertJsonToHtml } from "da-sc-sdk";

const { html, error } = convertJsonToHtml({
  json: { metadata: { schemaName: "project" }, data: { name: "Alice" } },
});
// `html` is a string ready to POST to your storage; persistence is the caller's job.
```

### Parse DA HTML back to JSON

```js
import { convertHtmlToJson } from "da-sc-sdk";

const { json, error } = convertHtmlToJson({ html });
// → { json: { metadata: { schemaName: 'project', ... }, data: { name: 'Alice' } } }
// Returns `{ error: '<reason>' }` on empty / malformed input.
```

### Stateful editing

```js
import { createEngine } from "da-sc-sdk";

const engine = createEngine({
  schema,
  document: { metadata: {}, data: {} },
  onChange: () => {
    /* state changed — read engine.getState() */
  },
});

engine.setField("/data/name", "Alice");
engine.addItem("/data/tags");
engine.setField("/data/tags/0", "demo");

const { values } = engine.getState().document; // your current snapshot
```

The engine is a **pure state machine**. It has no persistence concept — no transport, no save status, no callback beyond `onChange`. `onChange` is NOT called at construction; the initial state is read via `engine.getState()`. To start over with a different `(schema, document)` pair, create a new engine. Consumers that want to save react to `onChange` and write their own logic:

```js
let engine;
let lastValues;
engine = createEngine({
  schema,
  document,
  onChange: () => {
    const next = engine.getState().document.values;
    if (next === lastValues) return; // skip non-mutation transitions
    lastValues = next;
    // convert via `convertJsonToHtml`, POST, IndexedDB-cache — whatever fits
  },
});
// onChange does NOT fire at init; capture the initial reference manually.
lastValues = engine.getState().document.values;
```

For production semantics — single-flight save with re-queue, status tracking — see [docs/headless-consumer.md](docs/headless-consumer.md). The pattern is small enough (~40 lines) to vendor into any consumer.

See [examples/](./examples/) for runnable scripts and [docs/headless-consumer.md](docs/headless-consumer.md) for the full walkthrough.

## Schema dialect

The SDK accepts a strict subset of JSON Schema 2020-12. The complete contract — supported types, validation keywords, authoring rules — is in [docs/schema-spec.md](docs/schema-spec.md). Anything outside that contract surfaces in `schemaIssues` and is not rendered or validated.

## What's NOT in this SDK

By design:

- **No UI.** No DOM, no Lit, no rendering. UI is the caller's job.
- **No I/O.** No fetch, no file system, no DA-specific endpoints. Callers react to `onChange` and wire their own transport.
- **No persistence orchestration.** Single-flight save, re-queue, error retry, offline queue — all the consumer's choice. See [docs/headless-consumer.md](docs/headless-consumer.md) for a reference pattern.
- **No schema discovery.** Loading schemas from disk or external storage is the caller's job. The SDK accepts a schema object directly.
- **No raw `json2html`, `HTMLConverter`, or `compileSchema` in the public API.** They exist as internals but aren't exported — the five public functions cover every documented use case. If a future need shows up, we'll add it deliberately.

These concerns live in the consuming application.

## Architecture

```
src/
├── index.js          public API (5 named exports)
├── state-engine/     schema-constrained JSON state machine (no DOM, no network)
│   ├── index.js      createEngine, validateSchema, validateData (+ internals)
│   ├── schema.js     compileSchema ($ref, $defs, composition handling)
│   ├── model.js      buildModel + pointer→node map
│   ├── mutate.js     setField, addItem, insertItem, removeItem, moveItem
│   ├── pointer.js    RFC 6901 ops + definitionAt
│   ├── validation.js validateDocument
│   └── clone.js      deepClone util
└── html/             HTML codec (pure strings; no DOM)
    ├── html2json.js  parse DA wire format → JSON (convertHtmlToJson)
    ├── json2html.js  emit JSON → DA wire format (convertJsonToHtml + raw json2html)
    └── utils.js      prune helper shared by the emit path
```

`state-engine/` has zero external imports. `html/` depends on `hast-util-from-html` (pure JS, parse5-based) only for the `html → JSON` parse direction; the `JSON → html` direction is a pure string builder with no dependencies. The whole SDK has no DOM and no Node built-ins — it runs in Cloudflare Workers and other V8-isolate environments without modification.

## Stability

The five named exports above are the SDK's **entire** API. They are also the semver boundary.

The `package.json` `exports` map blocks any other path — deep imports like `da-sc-sdk/src/state-engine/schema.js` fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The vendored bundle (`dist/index.js`) only re-exports the same five functions. There is no supported way to reach internals from outside the package; that's by design.

## Documentation

| Doc | What it covers |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Layout, public API reference, state shape, validation, defaults policy, rules. |
| [docs/lifecycle.md](docs/lifecycle.md) | The synchronous call flow inside each public function (createEngine, mutations, validate, convert) plus cost characteristics. |
| [docs/schema-builder.md](docs/schema-builder.md) | `compileSchema` deep dive — schema resolution, kind inference, definition tree. |
| [docs/model-builder.md](docs/model-builder.md) | `buildModel` deep dive — definition + document → renderable tree. |
| [docs/schema-spec.md](docs/schema-spec.md) | The JSON Schema subset the SDK accepts — per-keyword contract. |
| [docs/headless-consumer.md](docs/headless-consumer.md) | Worked example of a non-browser consumer (MCP / Worker / CLI). |
