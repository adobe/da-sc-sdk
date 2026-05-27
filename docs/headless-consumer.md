# Headless consumer example

How a non-browser process — CLI script, MCP server, AI agent — drives the SDK editor. Same code path any consumer uses; no DOM involved.

The engine is a **pure state machine**: no persistence, no save status, no I/O. Consumers that want to persist react to `onChange` and run their own logic.

## Pure state machine (no persistence)

The most common pattern for headless consumers — build a document in memory, then do whatever you want with it.

```js
import { createEngine, validateData } from 'da-sc-sdk';

// Schema must follow ./schema-spec.md — every node declares `type` and `title`,
// no composition keywords, only the constraints listed in the spec.
const schema = {
  type: 'object',
  title: 'Project',
  required: ['name'],
  properties: {
    name:   { type: 'string', title: 'Name' },
    status: { type: 'string', title: 'Status', enum: ['Draft', 'Active'] },
    tags:   { type: 'array',  title: 'Tags', items: { type: 'string', title: 'Tag' } },
  },
};

let engine;
const onChange = () => {
  const state = engine.getState();
  const errors = Object.keys(state.validation.errors).length;
  const issues = state.schemaIssues.length;
  console.log(`errors=${errors} issues=${issues}`);
};

engine = createEngine({
  schema,
  document: { metadata: {}, data: {} },
  onChange,
});
// onChange does NOT fire at init. Read the initial state directly:
console.log('initial errors:', Object.keys(engine.getState().validation.errors).length);
// → 1 (name is required, document is empty)

engine.setField('/data/name', 'Alice');             // satisfies `required`
engine.setField('/data/status', 'Active');          // satisfies `enum`
engine.addItem('/data/tags');                       // append an array slot
engine.setField('/data/tags/0', 'demo');            // fill the slot

console.log(JSON.stringify(engine.getState().document.values, null, 2));
// → {"metadata":{},"data":{"name":"Alice","status":"Active","tags":["demo"]}}
```

## With save-on-change

Layer your own persistence inside `onChange`. Track `document.values` by reference to skip non-mutation transitions:

```js
import { createEngine, convertJsonToHtml } from 'da-sc-sdk';

let engine;
let lastValues;

engine = createEngine({
  schema,
  document: { metadata: { schemaName: 'project' }, data: {} },
  onChange: () => {
    const next = engine.getState().document.values;
    if (next === lastValues) return;     // ignore non-mutation transitions
    lastValues = next;

    const { html, error } = convertJsonToHtml({ json: next });
    if (error) return;
    // ...POST `html` to your storage, write to disk, push to git, etc...
  },
});
// onChange doesn't fire at init — capture the initial reference manually.
lastValues = engine.getState().document.values;

engine.setField('/data/name', 'Alice');     // → onChange fires → you save
```

This is simple "save after every mutation." For production semantics — single-flight save with re-queue, status tracking — wrap the above pattern in ~40 lines of orchestration. The SDK intentionally leaves persistence to the consumer so each can pick its own semantics (single-flight, bulk, offline-queue, optimistic).

## Reacting to errors

`state.validation.errors` is a pointer-keyed map of ajv-style error entries. One canonical view — UIs look up by pointer, agents iterate.

```js
engine.setField('/data/status', 'Unknown');         // not in the enum
const { errors } = engine.getState().validation;

// Look up by pointer (UI rendering): O(1).
const err = errors['/data/status'];
// → {
//     keyword: 'enum',
//     instancePath: '/data/status',
//     params: { allowedValues: ['Draft', 'Active'] },
//     message: 'Must be one of the allowed options.',
//   }

// Iterate (agent loops):
for (const e of Object.values(errors)) {
  if (e.keyword === 'enum') {
    // Pick a valid option from e.params.allowedValues.
  }
}
```

`required` errors land at the **child** pointer (the field that's missing), with the field name in `params.missingProperty`:

```js
const result = validateData({ schema, data: { name: '', status: 'Unknown' } });
// → result.errors = {
//     '/data/name': {
//       keyword: 'required',
//       instancePath: '/data/name',               // directly actionable
//       params: { missingProperty: 'name' },
//       message: 'This field is required.',
//     },
//     '/data/status': {
//       keyword: 'enum',
//       instancePath: '/data/status',
//       params: { allowedValues: ['Draft', 'Active'] },
//       message: 'Must be one of the allowed options.',
//     },
//   }
```

`instancePath` is the field — `engine.setField(error.instancePath, value)` works directly. This is one deliberate deviation from ajv, which puts `required` at the parent pointer; the SDK puts pointer construction on its own side of the API.

Why the SDK omits `schemaPath`: ajv's full shape includes a pointer into the schema (e.g. `#/properties/name/minLength`). The SDK deliberately drops it — schema paths leak internal schema structure to whoever sees the errors, and our consumers (form UI, MCP, workers) don't need it. If you forward errors to an untrusted client, consider stripping `params.pattern` and `params.allowedValues` too.

## Three things to remember

- **Mutations are pointer-based.** Every change is identified by an RFC 6901 pointer (`/data/tags/0`). This maps directly to MCP tool parameters or agent action descriptions — no opaque handles, no field IDs.
- **Errors are structured data, not events.** `state.validation.errors` is a pointer-keyed map of `{ keyword, instancePath, params, message }` — UIs look up by pointer, agents iterate via `Object.values()`. Per-entry shape uses the standard JSON Schema vocabulary any agent already recognizes.
- **Schema issues are structured.** `state.schemaIssues` is an array of `{ pointer, reason, feature, details }` where `reason` is one of `unsupported-composition` / `unsupported-type` / `type-as-array` / `missing-type` / `external-ref` / `unresolved-ref` / `invalid-pattern`. An agent that built the schema can use the reason code to decide how to fix it on the next attempt.

## What schemas to write

The SDK accepts a strict subset of JSON Schema 2020-12. The full contract is in [schema-spec.md](./schema-spec.md). Anything outside that contract surfaces in `state.schemaIssues` and is not rendered.
