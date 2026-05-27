// Stateful editing — the engine is a pure state machine.
//
// Pattern: create an engine bound to a (schema, document) pair, apply
// pointer-addressed mutations. The SDK doesn't persist anything — that's
// the consumer's job. Observe state transitions via the onChange callback.
//
// In production, consumers layer persistence on top of `onChange`. This
// example shows the engine naked, plus a minimal save-on-change handler
// using `convertJsonToHtml`.
//
// Run: node examples/quick-start.js

import { createEngine, convertJsonToHtml } from '../src/index.js';

const schema = {
  type: 'object',
  title: 'Project',
  required: ['name'],
  properties: {
    name: { type: 'string', title: 'Name' },
    status: { type: 'string', title: 'Status', enum: ['Draft', 'Active'] },
    tags: { type: 'array', title: 'Tags', items: { type: 'string', title: 'Tag' } },
  },
};

// Optional save logic. The SDK only gives you onChange; how (and when, and
// whether) you persist is entirely your code. We track the document
// reference to skip non-mutation transitions (validation refresh, etc).
const path = '/projects/demo';
let lastValues;
const persist = (document) => {
  const { html, error } = convertJsonToHtml({ json: document });
  if (error) { return; }
  console.log(`[save] ${path} → ${html.length} chars`);
};

let engine;
const onChange = () => {
  const state = engine.getState();
  const errors = Object.keys(state.validation.errors).length;
  console.log(`[change] errors=${errors}`);

  const next = state.document?.values;
  if (next === lastValues) { return; }
  lastValues = next;
  persist(next);
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
lastValues = engine.getState().document?.values;

console.log('initial errors:', Object.keys(engine.getState().validation.errors).length);
// → 1 ('name' is required, doc is empty)

engine.setField('/data/name', 'Alice');
engine.setField('/data/status', 'Active');
engine.addItem('/data/tags');
engine.setField('/data/tags/0', 'demo');

console.log('---');
console.log('final  :', JSON.stringify(engine.getState().document.values, null, 2));
// → { "metadata": { "schemaName": "project" }, "data": { "name": "Alice", ... } }
