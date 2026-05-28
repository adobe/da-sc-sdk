// One-shot validation — the simplest possible use of the SDK.
//
// Use this pattern when you have a schema + a candidate data object and you
// just want "is this valid? if not, where?". No engine instance, no state,
// nothing held in memory. Suits MCP tools, CLI linters, pre-commit hooks.
//
// Run: node examples/validate-data.js

import { validateData } from '../src/index.js';

const schema = {
  type: 'object',
  title: 'Project',
  required: ['name'],
  properties: {
    name: { type: 'string', title: 'Name', minLength: 2 },
    status: { type: 'string', title: 'Status', enum: ['Draft', 'Active', 'Archived'] },
    tags: { type: 'array', title: 'Tags', items: { type: 'string', title: 'Tag' } },
  },
};

const candidate = {
  name: 'A', // too short
  status: 'Unknown', // not in enum
  tags: ['demo'],
};

const result = validateData({ schema, data: candidate });

console.log('valid   :', result.valid);
// → false (because the data has constraint violations below)

console.log('errors  :', result.errors);
// → {
//     '/data/name':   { keyword: 'minLength', instancePath: '/data/name',
//                       params: { limit: 2 },
//                       message: 'Must be at least 2 characters.' },
//     '/data/status': { keyword: 'enum',      instancePath: '/data/status',
//                       params: { allowedValues: ['Draft', 'Active', 'Archived'] },
//                       message: 'Must be one of the allowed options.' },
//   }
//
// `errors` is a pointer-keyed map. UIs look up by pointer
// (`errors['/data/name']`); agents iterate via `Object.values(errors)`.
// Per-entry shape mirrors ajv (`keyword`, `instancePath`, `params`,
// `message`). `required` errors carry the child pointer in `instancePath`,
// so consumers act on it directly — no pointer arithmetic.

console.log('issues  :', result.schemaIssues);
// → [] (the schema itself is fine; only the data is invalid)
//
// `validateSchema({ schema })` returns the same `valid` + `schemaIssues`
// shape, minus `errors`. Both validators are intentionally symmetric.
