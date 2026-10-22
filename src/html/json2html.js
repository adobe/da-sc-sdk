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

import { appendPointer } from '../shared/pointer.js';
import { isDataEmpty } from '../shared/empty.js';
import { isDeepEqual } from '../shared/equal.js';
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

function referenceText({ key, blockId }) {
  return textContent(`self://#${key.toLowerCase()}-${blockId}`);
}

// Blocks are numbered in the order they are written, so the same document is
// always written the same way and every ID is unique within it.
function addBlock({ key, innerHtml, writer }) {
  const blockId = String(writer.blocks.length + 1);
  writer.blocks.push(block({ className: `${key} ${key}-${blockId}`, innerHtml }));
  return blockId;
}

function codecOf({
  key, pointer, parentPointer, writer,
}) {
  const { byPointer } = writer;
  return codecFor({ node: byPointer?.[pointer], parentNode: byPointer?.[parentPointer], key });
}

function primitiveHtml({
  codec, value, parentValue, writer,
}) {
  return codec.toHtml({ value, parentValue, options: writer.options });
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
  const codec = codecOf({ key, pointer, writer });
  return `<li>${primitiveHtml({ codec, value: item, writer })}</li>`;
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
        parentValue: object,
        parentPointer: pointer,
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
  key, value, pointer, parentValue, parentPointer, writer,
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
  const codec = codecOf({
    key, pointer, parentPointer, writer,
  });
  const html = primitiveHtml({
    codec, value, parentValue, writer,
  });
  if (codec.blockContent) {
    return `<div>${html}</div>`;
  }
  return `<div><p>${html}</p></div>`;
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
  const pointer = '/data';
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

// `writer` collects the nested blocks and carries the options codecs read.
export default function json2html({ json, byPointer, externalImagesAsLinks }) {
  const { metadata, data } = json;
  const writer = { blocks: [], byPointer, options: { externalImagesAsLinks } };
  const formBlockHtml = formBlock({ metadata, writer });
  const dataBlockHtml = dataBlock({ schemaName: metadata.schemaName, data, writer });
  const mainInner = `${formBlockHtml}${dataBlockHtml}${writer.blocks.join('')}`;
  return `<body><header></header><main><div>${mainInner}</div></main><footer></footer></body>`;
}

// `json.metadata.schemaName` names the outer data block in DA's wire format.
function verifyJson(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return 'Invalid JSON payload.';
  }
  if (!json.metadata || typeof json.metadata !== 'object' || Array.isArray(json.metadata)) {
    return 'json.metadata is required and must be an object.';
  }
  if (typeof json.metadata.schemaName !== 'string' || json.metadata.schemaName === '') {
    return 'json.metadata.schemaName is required and must be a non-empty string.';
  }
  return undefined;
}

// Without a model every value is written as text, so only a given model is checked.
function verifyModel({ model, json }) {
  if (model === undefined || model === null) {
    return undefined;
  }
  if (typeof model !== 'object' || model.root?.pointer !== '/data'
    || !model.byPointer || typeof model.byPointer !== 'object' || !model.document) {
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
export function convertJsonToHtml({ json, model, config } = {}) {
  const { externalImagesAsLinks = false } = config ?? {};
  const error = verifyInput({ json, model });
  if (error) {
    return { error };
  }

  const html = json2html({ json, byPointer: model?.byPointer, externalImagesAsLinks });
  return { html };
}
