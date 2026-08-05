// Schema validation — check whether a schema itself is well-formed, with
// no data involved.
//
// Use this pattern when:
//   - you accept schemas from users (web form, CLI flag, external storage)
//   - you fetch schemas from a registry and want to fail fast on malformed input
//   - you want to surface a clear "this schema is broken" message before
//     opening an editor UI (which would otherwise return a confused
//     "valid: false" result via validateData with empty data)
//
// Run: node examples/validate-schema.js

import { validateSchema } from '../src/index.js';

// 1. A well-formed schema — every node declares `type` and `title`, no
//    composition keywords, only same-document `$ref`s.
const goodSchema = {
  type: 'object',
  title: 'Project',
  required: ['name'],
  properties: {
    name: { type: 'string', title: 'Name' },
    status: { type: 'string', title: 'Status', enum: ['Draft', 'Active'] },
    tags: { type: 'array', title: 'Tags', items: { type: 'string', title: 'Tag' } },
  },
};

console.log('Good schema:', validateSchema({ schema: goodSchema }));
// → { valid: true, schemaIssues: [] }

// 2. A schema with multiple problems — useful for testing your error UI.
const badSchema = {
  type: 'object',
  title: 'Broken',
  properties: {
    // (a) composition keyword without sibling `properties` — unsupported.
    mystery: { oneOf: [{ type: 'string' }, { type: 'number' }], title: 'Mystery' },

    // (b) type-as-array — unsupported (no nullable types in the SDK's dialect).
    nullable: { type: ['string', 'null'], title: 'Nullable' },

    // (c) external $ref — only same-document `#/...` refs are allowed.
    remote: { $ref: 'https://example.com/schema.json' },

    // (d) missing `type` — every node must declare one.
    untyped: { title: 'Untyped' },

    // (e) unparseable `pattern` regex — ajv would throw at compile time;
    //     the SDK surfaces it on `issues` and drops the pattern from validation.
    code: { type: 'string', pattern: '[', title: 'Code' },
  },
};

const result = validateSchema({ schema: badSchema });
console.log();
console.log('Bad schema:');
console.log('  valid       :', result.valid);
console.log('  schemaIssues:');
for (const issue of result.schemaIssues) {
  // reason = machine code to branch on; schemaPath = where to fix it;
  // message = ready human summary. (Also available: issue.pointer, issue.details.)
  console.log(`    ${issue.reason} at ${issue.schemaPath} — ${issue.message}`);
}
// → valid       : false
//   schemaIssues:
//     unsupported-composition at /properties/mystery — Composition "oneOf" is not supported.
//     type-as-array at /properties/nullable — The type must be a single value, not an array.
//     external-ref at /properties/remote — External reference "https://example.com/schema.json" is not supported; use a local "#/…" reference.
//     missing-type at /properties/untyped — A type is required.
//     invalid-pattern at /properties/code — The pattern is not a valid regular expression.
