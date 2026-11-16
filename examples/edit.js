// Stateful editing — create an engine bound to a (schema, document) pair
// and apply pointer-addressed mutations. The engine validates, deep-clones,
// and notifies via `onChange`; persistence is the consumer's job.
//
// Use this pattern when:
//   - building an interactive editor (browser UI, TUI) that needs to react
//     to each change incrementally rather than re-validating from scratch
//   - an agent holds edit state across multiple turns and needs a stable
//     document reference between mutations
//   - you want validation, defaulting, and structural mutations behind one
//     API instead of reassembling them yourself
//
// This example shows the engine naked, plus a minimal save-on-change
// handler using `convertJsonToHtml`.
//
// Run: node examples/edit.js

import { createEngine, convertJsonToHtml } from '../src/index.js';

const schema = {
  type: 'object',
  title: 'Project',
  required: ['name'],
  properties: {
    name: { type: 'string', title: 'Name' },
    status: { type: 'string', title: 'Status', enum: ['Draft', 'Active'] },
    tags: { type: 'array', title: 'Tags', items: { type: 'string', title: 'Tag' } },
    logo: { $ref: 'https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/image/v1.0.0.json', title: 'Logo' },
  },
};

// Optional save logic. The SDK only gives you onChange; how (and when, and
// whether) you persist is entirely your code. We track the document
// reference to skip non-mutation transitions (validation refresh, etc).
const path = '/projects/demo';
let lastValues;
const persist = ({ document, model }) => {
  // The model lets the converter write asset fields as images or links.
  const { html, error } = convertJsonToHtml({ json: document, model });
  if (error) { return; }
  console.log(`[save] ${path}, ${html.length} chars, image: ${html.includes('<img ')}`);
};

let engine;
const onChange = () => {
  const state = engine.getState();
  const errors = Object.keys(state.validation.errors).length;
  console.log(`[change] errors=${errors}`);

  const next = state.document;
  if (next === lastValues) { return; }
  lastValues = next;
  persist(state);
};

// `metadata.schemaName` is required for convertJsonToHtml() — it becomes the
// class on the emitted `<div class="project">` block. Consumers set this
// when they pick a schema (UI via a picker; CLI/agent programmatically).
//
// `onChange` is NOT called during initialization. Read the initial state
// directly via getState() if you need it; onChange only fires for actual
// mutations. No "observing" flag needed.
engine = createEngine({
  schema,
  document: { metadata: { schemaName: 'project' }, data: {} },
  onChange,
});
lastValues = engine.getState().document;

console.log('initial errors:', Object.keys(engine.getState().validation.errors).length);
// Prints 1, because 'name' is required and the document is empty.

engine.setField('/data/name', 'Alice');
engine.setField('/data/status', 'Active');
engine.addItem('/data/tags');
engine.setField('/data/tags/0', 'demo');
engine.setField('/data/logo/src', 'https://content.da.live/org/site/logo.png');
engine.setField('/data/logo/altText', 'Project logo');
// The save handler prints `[save] …, image: true`.

console.log('---');
console.log('final  :', JSON.stringify(engine.getState().document, null, 2));
// Prints { "metadata": { "schemaName": "project" }, "data": { "name": "Alice", ... } }
