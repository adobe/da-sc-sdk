/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

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
import { isMediaImage, normalizeMediaSource } from './media.js';
import { compileDefinition } from '../state-engine/schema.js';

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

function isMedia(definition, value) {
  return definition?.semanticType === 'media' && typeof value === 'string' && value.trim() !== '';
}

// Images are written as `<img>` so EDS ingests them into the media bus. Other
// files, and images the caller wants linked, are written as links that EDS keeps.
function mediaHtml(src, { isLinked }) {
  const value = normalizeMediaSource(src);
  if (isMediaImage(value) && !isLinked(value)) {
    return `<img src="${escapeAttr(value)}" alt="">`;
  }
  return `<a href="${escapeAttr(value)}">${escapeText(value)}</a>`;
}

function childDefinition(definition, key) {
  return definition?.children?.find((child) => child.key === key);
}

function selfRefLi(key, guid) {
  return `<li>${textContent(`self://#${key.toLowerCase()}-${guid}`)}</li>`;
}

function arrayItemLi(key, item, context, definition) {
  if (Array.isArray(item)) {
    // eslint-disable-next-line no-use-before-define
    return selfRefLi(key, arrayBlock(key, item, context, definition));
  }
  if (typeof item === 'object' && item !== null) {
    // eslint-disable-next-line no-use-before-define
    return selfRefLi(key, nestedBlock(key, item, context, definition));
  }
  if (isMedia(definition, item)) {
    return `<li>${mediaHtml(item, context.media)}</li>`;
  }
  return `<li>${textContent(item)}</li>`;
}

function nestedBlock(key, obj, context, definition) {
  const guid = Math.random().toString(36).substring(2, 8);
  const className = `${key} ${key}-${guid}`;
  const rowsHtml = Object.entries(obj).map(([k, v]) => {
    // eslint-disable-next-line no-use-before-define
    const valColHtml = valueCol(k, v, context, childDefinition(definition, k));
    return row(k, valColHtml);
  }).join('');
  context.nestedBlocks.push(block(className, rowsHtml));
  return guid;
}

function arrayBlock(key, arr, context, definition) {
  const guid = Math.random().toString(36).substring(2, 8);
  const className = `${key} ${key}-${guid}`;
  const itemsHtml = arr
    .map((item) => arrayItemLi(key, item, context, definition?.item))
    .join('');
  const valColHtml = `<div><ul>${itemsHtml}</ul></div>`;
  context.nestedBlocks.push(block(className, row('@items', valColHtml)));
  return guid;
}

function valueCol(key, value, context, definition) {
  if (value === null) { return null; }
  if (value === undefined) { return '<div></div>'; }

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      if (!value.length) { return null; }
      const itemsHtml = value
        .map((item) => arrayItemLi(key, item, context, definition?.item))
        .join('');
      return `<div><ul>${itemsHtml}</ul></div>`;
    }

    if (Object.keys(value).length === 0) { return null; }
    const objGuid = nestedBlock(key, value, context, definition);
    return `<div><p>${textContent(`self://#${key.toLowerCase()}-${objGuid}`)}</p></div>`;
  }

  if (isMedia(definition, value)) {
    return `<div><p>${mediaHtml(value, context.media)}</p></div>`;
  }
  return `<div><p>${textContent(value)}</p></div>`;
}

function formBlock(metadata, context) {
  const rowsHtml = Object.entries(metadata).map(([key, value]) => {
    const xKey = key === 'schemaName' ? 'x-schema-name' : key;
    const valColHtml = valueCol(key, value, context);
    if (valColHtml === null) { return ''; }
    return row(xKey, valColHtml);
  }).join('');
  return block('da-form', rowsHtml);
}

function dataBlock(schemaName, data, context, definition) {
  if (Array.isArray(data)) {
    const valColHtml = valueCol(schemaName, data, context, definition);
    const inner = valColHtml === null ? '' : row('@items', valColHtml);
    return block(schemaName, inner);
  }
  const rowsHtml = Object.entries(data).map(([key, value]) => {
    const valColHtml = valueCol(key, value, context, childDefinition(definition, key));
    if (valColHtml === null) { return ''; }
    return row(key, valColHtml);
  }).join('');
  return block(schemaName, rowsHtml);
}

const DEFAULT_MEDIA = Object.freeze({ isLinked: () => false });

// Raw JSON → DA wire-format HTML. Default export; kept for the public
// `convertJsonToHtml` wrapper below and for tests. No pruning happens here.
// `definition` is an optional compiled schema node that identifies media fields.
export default function json2html(json, definition, media = DEFAULT_MEDIA) {
  const { metadata, data } = json;
  const { schemaName } = metadata;
  const context = { nestedBlocks: [], media };
  const formBlockHtml = formBlock(metadata, context);
  const dataBlockHtml = dataBlock(schemaName, data, context, definition);
  const mainInner = `${formBlockHtml}${dataBlockHtml}${context.nestedBlocks.join('')}`;
  return `<body><header></header><main><div>${mainInner}</div></main><footer></footer></body>`;
}

// Public API: prune empty/null leaves from the document, then convert to
// HTML. Mirrors what the editor saves. Symmetric pair with
// `convertHtmlToJson` from html2json.js.
//
// With an optional `schema`, `x-semantic-type: media` fields are written as
// `<img>` so EDS ingests them, and non-image files as links that EDS keeps.
// Media options are grouped under `media`. `media.isLinked(src)` also writes
// the images it returns true for as links, for sites that deliver images
// through their own code. Without a schema, every value is written as text.
//
// `json.metadata.schemaName` is required — it determines the outer data
// block's class name (the schema identifier in DA's wire format). We check
// it explicitly so consumers get a clear error instead of a deep TypeError
// when the metadata is missing or malformed.
export function convertJsonToHtml({ json, schema, media } = {}) {
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
  const mediaOptions = typeof media?.isLinked === 'function'
    ? { isLinked: (src) => media.isLinked(src) }
    : DEFAULT_MEDIA;
  // An unusable schema writes every value as text, so saving never fails on it.
  return {
    html: json2html({ ...json, data: pruned ?? {} }, compileDefinition(schema), mediaOptions),
  };
}
