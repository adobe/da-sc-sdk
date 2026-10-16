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
| `convertJsonToHtml` | Convert JSON → DA wire-format HTML.                  | `{ html } \| { error }`           |
| `convertHtmlToJson` | Convert DA HTML → JSON.                              | `{ json } \| { error }`           |
| `bundleSchema`      | Embed the asset definitions for other validators.    | `{ schema } \| { error }`         |

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
// → { valid, schemaIssues }

validateData({ schema, data });
// → { valid, errors, schemaIssues }
```

`errors` is a pointer-keyed map; `errors[pointer]?.message` is O(1). Each entry exposes `keyword`, `instancePath`, `params`, and `message` fields. `valid` is `true` only when both `schemaIssues` and `errors` are empty — you can't claim a document is valid against a broken schema.

### Validate with other JSON Schema validators

Asset fields reference the SDK's image and file definitions by URL (see [Assets](docs/schema-spec.md#assets)). The SDK resolves these URLs to its built-in copies and never fetches them. The definitions are exported as `IMAGE_SCHEMA` and `FILE_SCHEMA`, their URLs as `IMAGE_SCHEMA_URL` and `FILE_SCHEMA_URL`, and the JSON files as `@adobe/da-sc-sdk/schemas/image/v1.json` and `@adobe/da-sc-sdk/schemas/file/v1.json`.

Most other validators, such as AJV, don't fetch remote references. `bundleSchema` returns a copy of the schema with each referenced definition embedded under `$defs` (as `da-image-v1` or `da-file-v1`). Each embedded definition keeps its `$id`, so the `$ref`s resolve offline:

```js
import Ajv2020 from "ajv/dist/2020.js";
import { bundleSchema } from "@adobe/da-sc-sdk";

const { schema: bundled } = bundleSchema({ schema });
const validate = new Ajv2020().compile(bundled);
```

The input schema is not modified, and a definition the schema already embeds is not added again.

### Convert (JSON ↔ HTML)

```js
import { convertJsonToHtml, convertHtmlToJson } from "@adobe/da-sc-sdk";

const { html } = convertJsonToHtml({
  json: { metadata: { schemaName: "project" }, data: { name: "Alice" } },
});

const { json } = convertHtmlToJson({ html });
```

`convertHtmlToJson` returns `{ error: "<reason>" }` on empty or malformed input.

An asset field, declared as `{ "$ref": "https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/image/v1.json" }` (`IMAGE_SCHEMA_URL`) or `{ "$ref": "https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/file/v1.json" }` (`FILE_SCHEMA_URL`), is an object whose properties the SDK defines: `src` (where the asset is) and, for an image, `altText` (its description, which a field can require with `required: ["altText"]`). See [Assets](docs/schema-spec.md#assets). Like any object, it is written to its own block with one row per property and referenced as `self://#<key>-<id>`. Pass the document's model (`engine.getState().model`) to write the `src` row as an image or link, with `altText` as the image's `alt`. EDS ingests them into the media bus on preview, as it does for images in regular pages. Non-image files such as PDFs or videos are written as links, which EDS keeps, the same way Canvas inserts them. Pass `config: { externalImagesAsLinks: true }` to also write images as links when they come from another host, such as AEM Assets, so EDS keeps their URL; this matches Canvas when a site sets `aem.assets.image.type` to `link`. Media bus paths and images uploaded to DA (`content.da.live`, `stage-content.da.live`) stay images, because pages can only deliver them from the media bus. The path decides what is an image. Only paths ending in JPEG, PNG, GIF, WebP, AVIF or SVG count as images. Everything else, including values without an extension, counts as a file, because a file saved as an image breaks while an image saved as a link still works. Sources are trimmed, and media bus paths are stored without rendition parameters. Only media bus paths (`./media_<hash>.<ext>`) and absolute http(s) URLs are written as images or links. Any other value, such as a `javascript:` or `data:` URL, is written as text. The model must be built from the same document. Anything that is not a model, including the model of a schema with issues (`null`), is treated like no model, so every value is written as text.

```js
const { document, model } = engine.getState();
const { html } = convertJsonToHtml({ json: document, model });
// or, to keep other hosts' images as links:
convertJsonToHtml({ json: document, model, config: { externalImagesAsLinks: true } });
```

Without an editor, build the model from the schema:

```js
const { model } = createEngine({ schema, document: json }).getState();
const { html } = convertJsonToHtml({ json, model });
```

`convertHtmlToJson` reads an asset block like any object block. A cell or list item without text but with an image reads as the image's `src`; text always wins over an image, and a link reads as its text. On delivered pages, EDS has replaced images with media bus paths relative to the page. Pass the page URL as `asset.base` so consumers get absolute URLs, resolved the way a browser resolves them on that page, without rendition parameters.

```js
const { json } = convertHtmlToJson({ html, asset: { base: "https://main--site--org.aem.page/players/ada" } });
// image value: "https://main--site--org.aem.page/players/media_<hash>.jpg"
```

Without `asset.base`, image values stay relative to the page, for example `./media_<hash>.jpg`.

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
