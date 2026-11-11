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

// Emit DA Structured Content HTML from a JSON document. A pure string builder
// without DOM or async, so it runs in any ESM runtime. The output has this shape.
//
//   <body>
//     <header></header>
//     <main><div>{formBlock}{dataBlock}{...nestedBlocks}</div></main>
//     <footer></footer>
//   </body>
//
// Text nodes and attribute values are escaped at the boundary; structural
// markup is composed from template literals.

import { DATA_POINTER, appendPointer } from '../shared/pointer.js';
import { isDataEmpty } from '../shared/empty.js';
import { isDeepEqual } from '../shared/equal.js';
import { isJsonObject } from '../shared/object.js';
import { block, row, textContent } from './markup.js';
import { codecFor } from './codecs/index.js';

const EMPTY_CELL = '<div></div>';

// Data values carry their JSON pointer, which finds their model node in
// `byPointer`. Metadata values have no pointer, no model and keep empty values.
function isData(pointer) {
  return pointer !== undefined;
}

function childPointer({ pointer, key }) {
  return isData(pointer) ? appendPointer({ pointer, segment: key }) : undefined;
}

// Data skips empty values, as save leaves them out. Each entry keeps its
// original key or index, so its pointer matches the model.
function entriesToWrite({ value, pointer }) {
  const entries = Object.entries(value);
  if (!isData(pointer)) {
    return entries;
  }
  return entries.filter(([, entryValue]) => !isDataEmpty(entryValue));
}

// A block's name is its key as a class name, the way EDS names classes, so a
// key with spaces or other characters stays one class the reader can match.
function blockName(key) {
  const name = key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return name || 'block';
}

function referenceText({ key, blockId, type = '' }) {
  return textContent(`self://${type}#${blockName(key)}-${blockId}`);
}

// Blocks are numbered in the order they are written, so the same document is
// always written the same way and every ID is unique within it.
function addBlock({ key, innerHtml, writer }) {
  const blockId = String(writer.blocks.length + 1);
  const name = blockName(key);
  writer.blocks.push(block({ className: `${name} ${name}-${blockId}`, innerHtml }));
  return blockId;
}

function codecOf({ pointer, writer }) {
  return codecFor({ node: writer.byPointer?.[pointer] });
}

function primitiveHtml({ codec, value }) {
  return codec.toHtml({ value });
}

// The reference carries the semantic type, so the reader decodes the markup
// without a schema.
function markupBlockReference({
  key, html, pointer, writer,
}) {
  const blockId = addBlock({ key, innerHtml: `<div><div>${html}</div></div>`, writer });
  const type = writer.byPointer[pointer].semanticType;
  return referenceText({ key, blockId, type });
}

function itemHtml({
  key, item, pointer, writer,
}) {
  if (Array.isArray(item)) {
    // eslint-disable-next-line no-use-before-define
    const blockId = listBlock({ key, items: item, pointer, writer });
    return `<li>${referenceText({ key, blockId })}</li>`;
  }
  if (typeof item === 'object' && item !== null) {
    // eslint-disable-next-line no-use-before-define
    const blockId = objectBlock({ key, object: item, pointer, writer });
    return `<li>${referenceText({ key, blockId })}</li>`;
  }
  const codec = codecOf({ pointer, writer });
  const html = primitiveHtml({ codec, value: item });
  if (codec.fromHtml && html) {
    const reference = markupBlockReference({ key, html, pointer, writer });
    return `<li>${reference}</li>`;
  }
  return `<li>${html}</li>`;
}

function listHtml({
  key, items, pointer, writer,
}) {
  const itemsHtml = entriesToWrite({ value: items, pointer })
    .map(([index, item]) => itemHtml({
      key, item, pointer: childPointer({ pointer, key: index }), writer,
    }))
    .join('');
  return `<ul>${itemsHtml}</ul>`;
}

function listBlock({
  key, items, pointer, writer,
}) {
  const cellHtml = `<div>${listHtml({ key, items, pointer, writer })}</div>`;
  return addBlock({ key, innerHtml: row({ key: '@items', cellHtml }), writer });
}

function objectBlock({
  key, object, pointer, writer,
}) {
  const rowsHtml = entriesToWrite({ value: object, pointer })
    .map(([childKey, childValue]) => row({
      key: childKey,
      // eslint-disable-next-line no-use-before-define
      cellHtml: valueCell({
        key: childKey,
        value: childValue,
        pointer: childPointer({ pointer, key: childKey }),
        writer,
      }),
    }))
    .join('');
  return addBlock({ key, innerHtml: rowsHtml, writer });
}

function listCell({
  key, items, pointer, writer,
}) {
  if (!entriesToWrite({ value: items, pointer }).length) {
    return null;
  }
  return `<div>${listHtml({ key, items, pointer, writer })}</div>`;
}

function referenceCell({
  key, object, pointer, writer,
}) {
  if (!entriesToWrite({ value: object, pointer }).length) {
    return null;
  }

  const blockId = objectBlock({ key, object, pointer, writer });
  return `<div><p>${referenceText({ key, blockId })}</p></div>`;
}

// The value column of a row, or null when the row has no value column.
function valueCell({
  key, value, pointer, writer,
}) {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return EMPTY_CELL;
  }
  if (Array.isArray(value)) {
    return listCell({ key, items: value, pointer, writer });
  }
  if (typeof value === 'object') {
    return referenceCell({ key, object: value, pointer, writer });
  }
  const codec = codecOf({ pointer, writer });
  const html = primitiveHtml({ codec, value });
  if (!codec.fromHtml) {
    return `<div><p>${html}</p></div>`;
  }
  if (!html) {
    return EMPTY_CELL;
  }
  const reference = markupBlockReference({ key, html, pointer, writer });
  return `<div><p>${reference}</p></div>`;
}

function entryRowsHtml({ value, pointer, writer }) {
  return entriesToWrite({ value, pointer }).map(([key, entryValue]) => {
    const cellHtml = valueCell({
      key, value: entryValue, pointer: childPointer({ pointer, key }), writer,
    });
    return cellHtml === null ? '' : row({ key, cellHtml });
  }).join('');
}

function formBlock({ metadata, writer }) {
  const value = Object.fromEntries(Object.entries(metadata)
    .map(([key, entryValue]) => [key === 'schemaName' ? 'x-schema-name' : key, entryValue]));
  return block({ className: 'da-form', innerHtml: entryRowsHtml({ value, writer }) });
}

function dataBlock({ schemaName, data, writer }) {
  const pointer = DATA_POINTER;
  if (Array.isArray(data)) {
    const cellHtml = valueCell({
      key: schemaName, value: data, pointer, writer,
    });
    const innerHtml = cellHtml === null ? '' : row({ key: '@items', cellHtml });
    return block({ className: schemaName, innerHtml });
  }
  const innerHtml = entryRowsHtml({ value: data ?? {}, pointer, writer });
  return block({ className: schemaName, innerHtml });
}

// `writer` collects the nested blocks and finds each value's model node.
export default function json2html({ json, byPointer }) {
  const { metadata, data } = json;
  const writer = { blocks: [], byPointer };
  const formBlockHtml = formBlock({ metadata, writer });
  const dataBlockHtml = dataBlock({ schemaName: metadata.schemaName, data, writer });
  const mainInner = `${formBlockHtml}${dataBlockHtml}${writer.blocks.join('')}`;
  return `<body><header></header><main><div>${mainInner}</div></main><footer></footer></body>`;
}

// `json.metadata.schemaName` names the outer data block in DA's wire format.
function verifyJson(json) {
  if (!isJsonObject(json)) {
    return 'Invalid JSON payload.';
  }
  if (!isJsonObject(json.metadata)) {
    return 'json.metadata is required and must be an object.';
  }
  if (typeof json.metadata.schemaName !== 'string' || json.metadata.schemaName === '') {
    return 'json.metadata.schemaName is required and must be a non-empty string.';
  }
  return undefined;
}

function isModel(model) {
  return isJsonObject(model) && model.root?.pointer === DATA_POINTER
    && isJsonObject(model.byPointer) && isJsonObject(model.document);
}

// Without a model every value is written as text, so only a given model is checked.
function verifyModel({ model, json }) {
  if (model === undefined || model === null) {
    return undefined;
  }
  if (!isModel(model)) {
    return 'model must be the model of engine.getState().';
  }
  if (model.document.metadata?.schemaName !== json.metadata.schemaName) {
    return 'model was built for another schema than json.metadata.schemaName.';
  }
  if (!isDeepEqual(model.document.data, json.data)) {
    return 'model was built from other data than json.data.';
  }
  return undefined;
}

// Why the input can't be written, or undefined when it can.
function verifyInput({ json, model }) {
  const jsonError = verifyJson(json);
  if (jsonError) {
    return jsonError;
  }

  const modelError = verifyModel({ model, json });
  if (modelError) {
    return modelError;
  }

  return undefined;
}

// See index.d.ts for the public contract.
export function convertJsonToHtml({ json, model } = {}) {
  const error = verifyInput({ json, model });
  if (error) {
    return { error };
  }

  const html = json2html({ json, byPointer: model?.byPointer });
  return { html };
}
