// All 5 public functions take a single destructured object argument. This
// is uniform across the SDK so consumers don't have to remember which call
// is positional and which is named — and so optional parameters can be
// added later without breaking existing callers.

// Stateful state engine — schema-compiled document with mutations,
// validation, and an onChange notification. `createEngine({ schema,
// document, onChange })` returns an engine in its initial state; the engine
// exposes `getState()` plus mutation methods (`setField`, `addItem`,
// `insertItem`, `removeItem`, `moveItem`). To start over with a different
// (schema, document) pair, create a new engine.
export { createEngine } from './state-engine/index.js';

// Schema validation — "is this schema well-formed?"
// `validateSchema({ schema })` returns `{ valid, schemaIssues }`.
export { validateSchema } from './state-engine/index.js';

// Data validation — "does this data satisfy this schema?"
// `validateData({ schema, data })` returns `{ valid, errors, schemaIssues }`.
// `errors` is a pointer-keyed map: `{ [instancePath]: { keyword,
// instancePath, params, message } }`. UI consumers do `errors[pointer]?.message`;
// agents iterate via `Object.values(errors)`. `schemaIssues` is populated when
// the schema itself has problems — callers that don't trust the schema should
// either check `schemaIssues.length === 0` or call `validateSchema()` first.
export { validateData } from './state-engine/index.js';

// JSON → DA wire-format HTML. Prunes empty/null/whitespace leaves before
// emitting (same shape the engine saves). Pure string builder, no DOM.
// `convertJsonToHtml({ json })` returns `{ html } | { error }`.
export { convertJsonToHtml } from './html/json2html.js';

// DA wire-format HTML → JSON. Symmetric pair with `convertJsonToHtml`.
// `convertHtmlToJson({ html })` returns `{ json } | { error }`.
export { convertHtmlToJson } from './html/html2json.js';
