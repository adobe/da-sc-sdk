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
import {
  isAssetSource, isIngestedImage, isMediaImage, normalizeMediaSource,
} from './media.js';
import { fieldMap } from './field-map.js';

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

function isAsset(field, value) {
  return field?.semanticType === 'asset' && typeof value === 'string'
    && isAssetSource(normalizeMediaSource(value));
}

// Images are written as `<img>`, which EDS copies into the media bus, and
// other assets as links. With `externalImagesAsLinks`, only media bus images and
// images uploaded to DA stay `<img>`; images from other hosts are written as
// links, so EDS keeps their URL.
function assetHtml(src, { externalImagesAsLinks }) {
  const value = normalizeMediaSource(src);
  const image = externalImagesAsLinks ? isIngestedImage(value) : isMediaImage(value);
  if (image) {
    return `<img src="${escapeAttr(value)}" alt="">`;
  }
  return `<a href="${escapeAttr(value)}">${escapeText(value)}</a>`;
}

function childField(field, key) {
  return field?.children?.get(key);
}

// A reference to a nested block. The host names what the block holds when it
// is not an object or array, for example `self://asset#hero-abc123`.
function selfRef(key, guid, type = '') {
  return textContent(`self://${type}#${key.toLowerCase()}-${guid}`);
}

function selfRefLi(key, guid, type) {
  return `<li>${selfRef(key, guid, type)}</li>`;
}

function newBlock(key, innerHtml, ctx) {
  const guid = Math.random().toString(36).substring(2, 8);
  ctx.blocks.push(block(`${key} ${key}-${guid}`, innerHtml));
  return guid;
}

// Each asset is written to its own block and referenced as `self://asset#…`,
// so readers know from the reference what the block holds. Like an object
// block, it has one row per property: `asset` holds the asset, and further
// properties can be added as rows later.
function assetBlock(key, src, ctx) {
  return newBlock(key, row('asset', `<div><p>${assetHtml(src, ctx)}</p></div>`), ctx);
}

function arrayItemLi(key, item, ctx, field) {
  if (Array.isArray(item)) {
    // eslint-disable-next-line no-use-before-define
    return selfRefLi(key, arrayBlock(key, item, ctx, field));
  }
  if (typeof item === 'object' && item !== null) {
    // eslint-disable-next-line no-use-before-define
    return selfRefLi(key, nestedBlock(key, item, ctx, field));
  }
  if (isAsset(field, item)) {
    return selfRefLi(key, assetBlock(key, item, ctx), 'asset');
  }
  return `<li>${textContent(item)}</li>`;
}

function nestedBlock(key, obj, ctx, field) {
  const guid = Math.random().toString(36).substring(2, 8);
  const className = `${key} ${key}-${guid}`;
  const rowsHtml = Object.entries(obj).map(([k, v]) => {
    // eslint-disable-next-line no-use-before-define
    const valColHtml = valueCol(k, v, ctx, childField(field, k));
    return row(k, valColHtml);
  }).join('');
  ctx.blocks.push(block(className, rowsHtml));
  return guid;
}

function arrayBlock(key, arr, ctx, field) {
  const itemsHtml = arr
    .map((item) => arrayItemLi(key, item, ctx, field?.item))
    .join('');
  return newBlock(key, row('@items', `<div><ul>${itemsHtml}</ul></div>`), ctx);
}

function valueCol(key, value, ctx, field) {
  if (value === null) { return null; }
  if (value === undefined) { return '<div></div>'; }

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      if (!value.length) { return null; }
      const itemsHtml = value
        .map((item) => arrayItemLi(key, item, ctx, field?.item))
        .join('');
      return `<div><ul>${itemsHtml}</ul></div>`;
    }

    if (Object.keys(value).length === 0) { return null; }
    const objGuid = nestedBlock(key, value, ctx, field);
    return `<div><p>${selfRef(key, objGuid)}</p></div>`;
  }

  if (isAsset(field, value)) {
    return `<div><p>${selfRef(key, assetBlock(key, value, ctx), 'asset')}</p></div>`;
  }
  return `<div><p>${textContent(value)}</p></div>`;
}

function formBlock(metadata, ctx) {
  const rowsHtml = Object.entries(metadata).map(([key, value]) => {
    const xKey = key === 'schemaName' ? 'x-schema-name' : key;
    const valColHtml = valueCol(key, value, ctx);
    if (valColHtml === null) { return ''; }
    return row(xKey, valColHtml);
  }).join('');
  return block('da-form', rowsHtml);
}

function dataBlock(schemaName, data, ctx, field) {
  if (Array.isArray(data)) {
    const valColHtml = valueCol(schemaName, data, ctx, field);
    const inner = valColHtml === null ? '' : row('@items', valColHtml);
    return block(schemaName, inner);
  }
  const rowsHtml = Object.entries(data).map(([key, value]) => {
    const valColHtml = valueCol(key, value, ctx, childField(field, key));
    if (valColHtml === null) { return ''; }
    return row(key, valColHtml);
  }).join('');
  return block(schemaName, rowsHtml);
}

// Raw JSON → DA wire-format HTML. Default export; kept for the public
// `convertJsonToHtml` wrapper below and for tests. No pruning happens here.
// `field` is an optional field map (see field-map.js) that identifies asset fields.
// `ctx` collects the nested blocks and carries the writer options.
export default function json2html(json, field, { externalImagesAsLinks = false } = {}) {
  const { metadata, data } = json;
  const { schemaName } = metadata;
  const ctx = { blocks: [], externalImagesAsLinks };
  const formBlockHtml = formBlock(metadata, ctx);
  const dataBlockHtml = dataBlock(schemaName, data, ctx, field);
  const mainInner = `${formBlockHtml}${dataBlockHtml}${ctx.blocks.join('')}`;
  return `<body><header></header><main><div>${mainInner}</div></main><footer></footer></body>`;
}

// Public API: prune empty/null leaves from the document, then convert to
// HTML. Mirrors what the editor saves. Symmetric pair with
// `convertHtmlToJson` from html2json.js.
//
// With an optional `model` (`engine.getState().model` of the same document),
// fields whose model node has `semanticType: 'asset'` are written to their
// own blocks: images as `<img>` and other assets as links. Without a model,
// every value is written as text.
//
// The optional `config` object holds writer settings:
// - `externalImagesAsLinks` (default `false`): write images from hosts other
//   than the media bus and DA as links too.
//
// `json.metadata.schemaName` is required — it determines the outer data
// block's class name (the schema identifier in DA's wire format). We check
// it explicitly so consumers get a clear error instead of a deep TypeError
// when the metadata is missing or malformed.
export function convertJsonToHtml({ json, model, config } = {}) {
  const { externalImagesAsLinks = false } = config ?? {};
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
  const html = json2html(
    { ...json, data: pruned ?? {} },
    fieldMap(model),
    { externalImagesAsLinks },
  );
  return { html };
}
