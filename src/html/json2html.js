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

// Save leaves out empty data values. Each writer below returns null when it
// writes nothing, so a container of such values is left out too.
function isLeftOut({ value, pointer }) {
  return isData(pointer) && isDataEmpty(value);
}

// Data that writes nothing is left out. Metadata is written as it is given.
function writesNothing({ html, pointer }) {
  return isData(pointer) && !html;
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

// A primitive as its codec writes it, or null for markup without text. Markup
// goes into a block of its own, referenced with its semantic type, so the
// reader decodes it without a schema. `parent` is the object holding the value,
// whose type picks the codec of a property such as an image's `src`.
function primitiveHtml({
  key, value, pointer, parent, writer,
}) {
  const { byPointer, options } = writer;
  const node = byPointer?.[pointer];
  const codec = codecFor({ node, parentNode: byPointer?.[parent?.pointer], key });
  const html = codec.toHtml({ value, parentValue: parent?.value, options });
  if (!codec.fromHtml) {
    return html;
  }
  if (!html) {
    return null;
  }
  const blockId = addBlock({ key, innerHtml: `<div><div>${html}</div></div>`, writer });
  return referenceText({ key, blockId, type: node.semanticType });
}

// The rows of an object's entries, without the rows that write nothing.
function entryRowsHtml({ value, pointer, writer }) {
  return Object.entries(value).map(([key, entryValue]) => {
    // eslint-disable-next-line no-use-before-define
    const cellHtml = valueCell({
      key,
      value: entryValue,
      pointer: childPointer({ pointer, key }),
      parent: { value, pointer },
      writer,
    });
    return cellHtml === null ? '' : row({ key, cellHtml });
  }).join('');
}

function objectBlock({
  key, object, pointer, writer,
}) {
  const rowsHtml = entryRowsHtml({ value: object, pointer, writer });
  if (writesNothing({ html: rowsHtml, pointer })) {
    return null;
  }
  return addBlock({ key, innerHtml: rowsHtml, writer });
}

// An object or a primitive as the text of a cell or a list item, or null when
// it writes nothing. An object goes into a block of its own.
function inlineHtml({
  key, value, pointer, parent, writer,
}) {
  if (!isJsonObject(value)) {
    return primitiveHtml({
      key, value, pointer, parent, writer,
    });
  }
  const blockId = objectBlock({
    key, object: value, pointer, writer,
  });
  return blockId === null ? null : referenceText({ key, blockId });
}

function itemHtml({
  key, item, pointer, writer,
}) {
  if (isLeftOut({ value: item, pointer })) {
    return null;
  }
  // eslint-disable-next-line no-use-before-define
  const html = Array.isArray(item) ? listBlockReference({ key, items: item, pointer, writer })
    : inlineHtml({
      key, value: item, pointer, writer,
    });
  return html === null ? null : `<li>${html}</li>`;
}

// Each item keeps its original index, so its pointer matches the model.
function listHtml({
  key, items, pointer, writer,
}) {
  const itemsHtml = items
    .map((item, index) => itemHtml({
      key, item, pointer: childPointer({ pointer, key: index }), writer,
    }))
    .filter((html) => html !== null)
    .join('');
  return writesNothing({ html: itemsHtml, pointer }) ? null : `<ul>${itemsHtml}</ul>`;
}

function listBlockReference({
  key, items, pointer, writer,
}) {
  const html = listHtml({
    key, items, pointer, writer,
  });
  if (html === null) {
    return null;
  }
  const cellHtml = `<div>${html}</div>`;
  const blockId = addBlock({ key, innerHtml: row({ key: '@items', cellHtml }), writer });
  return referenceText({ key, blockId });
}

// The value column of a row, or null when the row has no value column.
function valueCell({
  key, value, pointer, parent, writer,
}) {
  if (value === null || isLeftOut({ value, pointer })) {
    return null;
  }
  if (value === undefined) {
    return EMPTY_CELL;
  }
  if (typeof value === 'object' && !Object.keys(value).length) {
    return null;
  }
  if (Array.isArray(value)) {
    const html = listHtml({
      key, items: value, pointer, writer,
    });
    return html === null ? null : `<div>${html}</div>`;
  }
  const html = inlineHtml({
    key, value, pointer, parent, writer,
  });
  return html === null ? null : `<div><p>${html}</p></div>`;
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

// `writer` collects the nested blocks, finds each value's model node and
// carries the options codecs read.
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
export function convertJsonToHtml({ json, model, config } = {}) {
  const { externalImagesAsLinks = false } = config ?? {};
  const error = verifyInput({ json, model });
  if (error) {
    return { error };
  }

  const html = json2html({ json, byPointer: model?.byPointer, externalImagesAsLinks });
  return { html };
}
