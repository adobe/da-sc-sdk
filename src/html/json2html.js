// Emit DA Structured Content HTML from a JSON document.
//
// Pure string builder — no DOM, no async, no environment dependency. Works
// identically in browsers, Node, Deno, Bun, Web Workers, and edge runtimes.
//
// The output is the same shape `doc.body.outerHTML` produced previously:
//
//   <body>
//     <header></header>
//     <main><div>{formBlock}{dataBlock}{...nestedBlocks}</div></main>
//     <footer></footer>
//   </body>
//
// Text nodes and attribute values are escaped at the boundary; structural
// markup is composed from template literals.

import { prune } from './utils.js';

function escapeText(value) {
  return String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function escapeAttr(value) {
  return String(value).replace(/[&"]/g, (c) => ({ '&': '&amp;', '"': '&quot;' }[c]));
}

// Mirrors `node.textContent = value` coercion: `null` becomes empty; other
// values stringify via `String(value)`. This preserves the prior DOM
// behavior for boolean/number/undefined leaves.
function textContent(value) {
  if (value === null) { return ''; }
  return escapeText(value);
}

function row(key, valColHtml) {
  return `<div><div><h3>${textContent(key)}</h3></div>${valColHtml ?? ''}</div>`;
}

function block(name, innerHtml) {
  return `<div class="${escapeAttr(name.toLowerCase())}">${innerHtml}</div>`;
}

function selfRefLi(key, guid) {
  return `<li>${textContent(`self://#${key.toLowerCase()}-${guid}`)}</li>`;
}

function arrayItemLi(key, item, nestedBlocks) {
  if (Array.isArray(item)) {
    // eslint-disable-next-line no-use-before-define
    return selfRefLi(key, arrayBlock(key, item, nestedBlocks));
  }
  if (typeof item === 'object' && item !== null) {
    // eslint-disable-next-line no-use-before-define
    return selfRefLi(key, nestedBlock(key, item, nestedBlocks));
  }
  return `<li>${textContent(item)}</li>`;
}

function nestedBlock(key, obj, nestedBlocks) {
  const guid = Math.random().toString(36).substring(2, 8);
  const className = `${key} ${key}-${guid}`;
  const rowsHtml = Object.entries(obj).map(([k, v]) => {
    // eslint-disable-next-line no-use-before-define
    const valColHtml = valueCol(k, v, nestedBlocks);
    return row(k, valColHtml);
  }).join('');
  nestedBlocks.push(block(className, rowsHtml));
  return guid;
}

function arrayBlock(key, arr, nestedBlocks) {
  const guid = Math.random().toString(36).substring(2, 8);
  const className = `${key} ${key}-${guid}`;
  const itemsHtml = arr.map((item) => arrayItemLi(key, item, nestedBlocks)).join('');
  const valColHtml = `<div><ul>${itemsHtml}</ul></div>`;
  nestedBlocks.push(block(className, row('@items', valColHtml)));
  return guid;
}

function valueCol(key, value, nestedBlocks) {
  if (value === null) { return null; }
  if (value === undefined) { return '<div></div>'; }

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      if (!value.length) { return null; }
      const itemsHtml = value.map((item) => arrayItemLi(key, item, nestedBlocks)).join('');
      return `<div><ul>${itemsHtml}</ul></div>`;
    }

    if (Object.keys(value).length === 0) { return null; }
    const objGuid = nestedBlock(key, value, nestedBlocks);
    return `<div><p>${textContent(`self://#${key.toLowerCase()}-${objGuid}`)}</p></div>`;
  }

  return `<div><p>${textContent(value)}</p></div>`;
}

function formBlock(metadata, nestedBlocks) {
  const rowsHtml = Object.entries(metadata).map(([key, value]) => {
    const xKey = key === 'schemaName' ? 'x-schema-name' : key;
    const valColHtml = valueCol(key, value, nestedBlocks);
    if (valColHtml === null) { return ''; }
    return row(xKey, valColHtml);
  }).join('');
  return block('da-form', rowsHtml);
}

function dataBlock(schemaName, data, nestedBlocks) {
  if (Array.isArray(data)) {
    const valColHtml = valueCol(schemaName, data, nestedBlocks);
    const inner = valColHtml === null ? '' : row('@items', valColHtml);
    return block(schemaName, inner);
  }
  const rowsHtml = Object.entries(data).map(([key, value]) => {
    const valColHtml = valueCol(key, value, nestedBlocks);
    if (valColHtml === null) { return ''; }
    return row(key, valColHtml);
  }).join('');
  return block(schemaName, rowsHtml);
}

// Raw JSON → DA wire-format HTML. Default export; kept for the public
// `convertJsonToHtml` wrapper below and for tests. No pruning happens here.
export default function json2html(json) {
  const { metadata, data } = json;
  const { schemaName } = metadata;
  const nestedBlocks = [];
  const formBlockHtml = formBlock(metadata, nestedBlocks);
  const dataBlockHtml = dataBlock(schemaName, data, nestedBlocks);
  const mainInner = `${formBlockHtml}${dataBlockHtml}${nestedBlocks.join('')}`;
  return `<body><header></header><main><div>${mainInner}</div></main><footer></footer></body>`;
}

// Public API: prune empty/null leaves from the document, then convert to
// HTML. Mirrors what the editor saves. Symmetric pair with
// `convertHtmlToJson` from html2json.js.
//
// `json.metadata.schemaName` is required — it determines the outer data
// block's class name (the schema identifier in DA's wire format). We check
// it explicitly so consumers get a clear error instead of a deep TypeError
// when the metadata is missing or malformed.
export function convertJsonToHtml({ json } = {}) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { error: 'Invalid JSON payload.' };
  }
  if (!json.metadata || typeof json.metadata !== 'object' || Array.isArray(json.metadata)) {
    return { error: 'json.metadata is required and must be an object.' };
  }
  if (typeof json.metadata.schemaName !== 'string' || json.metadata.schemaName === '') {
    return { error: 'json.metadata.schemaName is required and must be a non-empty string.' };
  }
  const pruned = prune(json.data);
  return { html: json2html({ ...json, data: pruned ?? {} }) };
}
