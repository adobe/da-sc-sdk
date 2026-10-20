# da-sc-sdk

A headless SDK for working with **DA Structured Content** — schema-constrained JSON documents serialized as a defined HTML wire format. It exposes a small, focused API covering the operations supported today.

The SDK is pure ESM and ships with no DOM dependencies and no I/O. UI rendering, transport, and persistence are intentionally left to the consuming application.

In exchange, every tool built on the SDK shares the same DA Structured Content behavior — defined here once and used across all consumers, instead of being re-implemented (and inevitably drifting) in each tool.

## Status

`0.x` — the public API may change before `1.0.0`.

## Install

```bash
npm install @adobe/da-sc-sdk
```

```js
import {
  createEngine,
  convertJsonToHtml,
} from "@adobe/da-sc-sdk";
```

## Quick start

```js
import { createEngine, convertJsonToHtml } from "@adobe/da-sc-sdk";

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

const { document, model } = engine.getState();
const { html } = convertJsonToHtml({ json: document, model });
// `html` is ready to POST. Persistence is your job.
```

Runnable scripts in [examples/](./examples/).

## API

The SDK has six top-level functions.

| Function            | Purpose                                              | Returns                           |
| ------------------- | ---------------------------------------------------- | --------------------------------- |
| `createEngine`      | Stateful editing (UI editors, agents holding state). | `Engine`                          |
| `validateSchema`    | Lint a schema before binding to it.                  | `{ valid, schemaIssues }`         |
| `validateData`      | Check data against a schema.                         | `{ valid, errors, schemaIssues }` |
| `convertJsonToHtml` | Convert JSON to DA wire-format HTML.                  | `{ html } \| { error }`           |
| `convertHtmlToJson` | Convert DA HTML to JSON.                              | `{ json } \| { error }`           |
| `bundleSchema`      | Embed the asset definitions for other validators.    | `{ schema } \| { error }`         |

The constant `TYPE_URLS` holds the URL of the latest version of every type by name, for an asset field's `$ref`, such as `TYPE_URLS.image`.

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
import { validateSchema, validateData } from "@adobe/da-sc-sdk";

validateSchema({ schema });
// Returns { valid, schemaIssues }

validateData({ schema, data });
// Returns { valid, errors, schemaIssues }
```

`errors` is a pointer-keyed map; `errors[pointer]?.message` is O(1). Each entry exposes `keyword`, `instancePath`, `params`, and `message` fields. `valid` is `true` only when both `schemaIssues` and `errors` are empty — you can't claim a document is valid against a broken schema.

### Validate with other JSON Schema validators

Asset fields reference the SDK's image and file definitions by URL (see [Assets](docs/schema-spec.md#assets)). The SDK resolves these URLs to its built-in copies and never fetches them. Each type's JSON is exported as `@adobe/da-sc-sdk/schemas/<name>/v<version>.json`.

> **Experimental.** The type URLs, `TYPE_URLS` and `bundleSchema` may change until the types are served from a production domain. Schemas that use the current URLs keep working after that move.

Most other validators, such as AJV, don't fetch remote references. `bundleSchema` returns a copy of the schema with each referenced definition embedded under `$defs` (as `da-image-v1.0.0` or `da-file-v1.0.0`). Each embedded definition keeps its `$id`, so the `$ref`s resolve offline:

```js
import Ajv2020 from "ajv/dist/2020.js";
import { bundleSchema } from "@adobe/da-sc-sdk";

const { schema: bundled } = bundleSchema({ schema });
const validate = new Ajv2020().compile(bundled);
```

The input schema is not modified, and a definition the schema already embeds is not added again.

### Convert between JSON and HTML

```js
import { convertJsonToHtml, convertHtmlToJson } from "@adobe/da-sc-sdk";

const { html } = convertJsonToHtml({
  json: { metadata: { schemaName: "project" }, data: { name: "Alice" } },
});

const { json } = convertHtmlToJson({ html });
```

`convertHtmlToJson` returns `{ error: "<reason>" }` on empty or malformed input.

An asset field is an object. An image has `src` and `altText`, a file has `src`. A field can require alt text with `required: ["altText"]`. See [Assets](docs/schema-spec.md#assets). Like any object, an asset is written to its own block, referenced as `self://#<key>-<n>`.

Pass the document's model (`engine.getState().model`) to write `src` as an image or a link.

- An image field whose path ends in JPEG, PNG, GIF, WebP, AVIF or SVG becomes `<img>`, with `altText` as `alt`. EDS ingests it into the media bus on preview.
- A file field, or an image field with any other path, becomes a link, which EDS keeps.
- Only media bus paths (`./media_<hash>.<ext>`) and http(s) URLs become images or links. Other values, such as `javascript:` URLs, stay text.
- `src` is trimmed, and media bus paths lose their rendition parameters.
- With `config: { externalImagesAsLinks: true }` (experimental), images become links, like Canvas writes AEM Assets with `aem.assets.image.type: link`. Media bus images and DA uploads stay images.

Without a model, every value is written as text. A model of another schema or of other data returns `{ error }`.

```js
const { document, model } = engine.getState();
const { html } = convertJsonToHtml({ json: document, model });
// or, to write images as links:
convertJsonToHtml({ json: document, model, config: { externalImagesAsLinks: true } });
```

Without an editor, build the model from the schema:

```js
const { document, model } = createEngine({ schema, document: json }).getState();
const { html } = convertJsonToHtml({ json: document, model });
```

`convertHtmlToJson` reads each value as the text of its cell, and an asset like any object. An asset's `src` cell without text reads as its image source. On delivered pages, EDS replaces images with media bus paths relative to the page. Pass the page URL as `config.baseUrl` to get absolute URLs, resolved as a browser would.

```js
const { json } = convertHtmlToJson({ html, config: { baseUrl: "https://main--site--org.aem.page/players/ada" } });
// image value: "https://main--site--org.aem.page/players/media_<hash>.jpg"
```

Without `config.baseUrl`, media bus paths stay relative, such as `./media_<hash>.jpg`.

When the schema uses `x-semantic-type: "rich-text"`, pass the engine's model when writing and the schema when reading, so those values are stored as HTML markup instead of escaped text (see [schema-spec.md](docs/schema-spec.md#x-semantic-type)).

```js
const { html } = convertJsonToHtml({ json, model: engine.getState().model });
const { json } = convertHtmlToJson({ html, schema });
```

### Edit (with persistence)

The engine has no transport and no save status. Wire your own persistence on top of `onChange`:

```js
let engine;
let lastValues;
engine = createEngine({
  schema,
  document,
  onChange: () => {
    const { document: next, model } = engine.getState();
    if (next === lastValues) return; // skip non-mutation transitions
    lastValues = next;
    // convert via convertJsonToHtml({ json: next, model }), POST, IndexedDB-cache — whatever fits
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
} from "@adobe/da-sc-sdk";
```

## Runtime support

- ES2022 + ESM. No Node built-ins, no DOM.
- Node ≥18 and modern browsers.
- One runtime dependency: [hast-util-from-html](https://www.npmjs.com/package/hast-util-from-html).

## Design

- **Headless.** No UI, no DOM, no rendering. UIs subscribe to `onChange`.
- **No I/O.** No fetch, no file system, no DA endpoints. Callers wire their own transport.
- **Narrow public API.** The `package.json` `exports` map blocks deep imports. The exports listed under [API](#api) are the entire public API and the intended semver boundary.
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
