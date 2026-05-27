// JSON ↔ HTML roundtrip — the DA wire-format codec.
//
// Use this pattern when you need to import structured data INTO the DA
// HTML format, or extract data OUT of saved DA HTML. Interactive editors use
// `convertJsonToHtml` on save and `convertHtmlToJson` on load; these are the same
// primitives, headless.
//
// Both directions are pure string operations — no DOM needed in any runtime.
//
// Run: node examples/roundtrip.js

import { convertJsonToHtml, convertHtmlToJson } from '../src/index.js';

// Start with structured data: a "Project" schema's worth of content.
const original = {
  metadata: { schemaName: 'project', title: 'My demo project' },
  data: {
    name: 'Alice',
    status: 'Active',
    tags: ['demo', 'experimental'],
    contact: { email: 'alice@example.com' },
  },
};

// JSON → HTML. The metadata block becomes the `<div class="da-form">`,
// the data block becomes `<div class="project">`, and nested objects/arrays
// become referenced child blocks.
const { html, error } = convertJsonToHtml({ json: original });
if (error) {
  console.error('convertJsonToHtml failed:', error);
  process.exit(1);
}

console.log('=== HTML output (truncated) ===');
console.log(`${html.slice(0, 200)}...`);
console.log(`length: ${html.length} chars`);
console.log();

// HTML → JSON. Parses the HTML, walks the block structure, reconstructs
// the data. Useful for "import this saved document" workflows.
const { json: reloaded, error: parseError } = convertHtmlToJson({ html });
if (parseError) {
  console.error('convertHtmlToJson failed:', parseError);
  process.exit(1);
}

console.log('=== reloaded JSON ===');
console.log(JSON.stringify(reloaded, null, 2));
console.log();

// The roundtrip is lossless for valid data.
const ok = JSON.stringify(original) === JSON.stringify(reloaded);
console.log(`roundtrip identical? ${ok}`);
// → true
