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

import { fromHtml } from 'hast-util-from-html';
import { normalizeMediaSource, toAbsoluteMediaHref } from './media.js';
import { httpHref } from './utils.js';
import { ASSET_SRC } from '../types/asset.js';
import { compileSchema } from '../state-engine/schema.js';
import { codecFor } from './codecs/index.js';

const SELF_REF = 'self://#';

// Equivalent of `selectAll('main > div > div', tree)` without `hast-util-select`.
// We inline this one selector to avoid extra weight and CJS interop overhead.
function directChildElements(node, tagName) {
  return (node?.children ?? []).filter(
    (c) => c?.type === 'element' && c.tagName === tagName,
  );
}

function collectElements(node, tagName, out) {
  if (!node) { return; }
  if (node.type === 'element' && node.tagName === tagName) { out.push(node); }
  for (const child of node.children ?? []) { collectElements(child, tagName, out); }
}

function selectBlocks(tree) {
  const mains = [];
  collectElements(tree, 'main', mains);
  return mains.flatMap((main) => directChildElements(main, 'div')
    .flatMap((row) => directChildElements(row, 'div')));
}

// Element-only children. Filters out whitespace text nodes that pretty-printed
// HTML (e.g. real EDS output) introduces between sibling tags.
function elementChildren(node) {
  return (node?.children ?? []).filter((c) => c?.type === 'element');
}

// Recursive innerText. Walks descendant text nodes and concatenates them.
// Robust to nested wrappers (<p>, <h3>, <span>, …) and to direct text in
// cells (`<div>blog-post</div>` instead of `<div><p>blog-post</p></div>`).
function textContent(node) {
  if (!node) { return ''; }
  if (node.type === 'text') { return node.value ?? ''; }
  return (node.children ?? []).map(textContent).join('');
}

// The first non-empty `<img src>` below `node` in its stored form, or null.
// The writer emits at most one image per value; any further images are ignored.
// With a `baseHref`, media bus paths become absolute URLs resolved against it.
function imageSource({ node, baseHref }) {
  const images = [];
  collectElements(node, 'img', images);
  const src = images
    .map((img) => img.properties?.src)
    .find((value) => typeof value === 'string' && value.trim() !== '');
  if (src !== undefined) {
    return toAbsoluteMediaHref({ src: normalizeMediaSource(src), baseHref });
  }
  return null;
}

// Find a direct list child of a value cell. The wire format uses `<ul>`,
// but `<ol>` is accepted too — authors and external tools sometimes emit
// ordered lists, and the SDK should read whatever shape carries the same
// "this is an array" meaning. Same Postel's-law principle as the rest of
// the parser: tight producer, loose reader.
function firstListChild(node) {
  return elementChildren(node).find(
    (c) => c.tagName === 'ul' || c.tagName === 'ol',
  ) ?? null;
}

// The compiled schema node of `key` below `node`. `@items` rows carry the array itself.
function childNode({ node, key }) {
  if (key === '@items') {
    return node;
  }
  return node?.children?.find((child) => child.key === key);
}

// `definition` is the compiled schema of the document, or null without one.
// It selects a codec per value, the same way the writer does with the model.
export default class HTMLConverter {
  constructor({ html, baseHref, definition }) {
    this.baseHref = baseHref;
    this.definition = definition;
    this.tree = fromHtml(html);
    this.blocks = selectBlocks(this.tree);
    this.json = this.convertBlocksToJson();
  }

  convertBlocksToJson() {
    const metadata = this.getMetadata();
    const data = this.findAndConvert(metadata.schemaName, false, this.definition);
    return { metadata, data };
  }

  getMetadata() {
    const baseMeta = this.findAndConvert('da-form');
    const { 'x-schema-name': schemaName, ...rest } = baseMeta;
    return { schemaName, ...rest };
  }

  getProperties(block, node) {
    // Tolerant tree walk: skips whitespace text nodes between cells and
    // accepts value cells with or without an element wrapper. See the
    // "EDS-formatted HTML" tests in html2json.test.js for the shapes this
    // must handle.
    return elementChildren(block).reduce((rdx, row) => {
      const cols = elementChildren(row);
      if (cols.length < 2) { return rdx; }
      const [keyCol, valCol] = cols;
      const key = textContent(keyCol).trim();
      if (!key) { return rdx; }
      const valueNode = childNode({ node, key });
      const codec = codecFor({ node: valueNode, parentNode: node, key });
      rdx[key] = this.readValue({
        valCol, key, node: valueNode, codec,
      });
      return rdx;
    }, {});
  }

  // Read a value cell. A codec that reads markup reads the cell's nodes.
  // Otherwise a `<ul>` or `<ol>` child makes it an array, and the cell's text
  // is the value. Without text, a `src` cell reads as its image, since the
  // writer puts images only in an asset's `src` row.
  readValue({
    valCol, key, node, codec,
  }) {
    if (codec.fromHtml) {
      return codec.fromHtml({ nodes: valCol.children });
    }

    const list = firstListChild(valCol);
    if (list) { return this.readListValue(list, node?.item); }

    const text = textContent(valCol).trim();
    if (text !== '') {
      return this.getTypedValue(text, node);
    }
    if (key !== ASSET_SRC) {
      return '';
    }
    return imageSource({ node: valCol, baseHref: this.baseHref }) ?? '';
  }

  // Iterate only `<li>` children. Stray non-`<li>` elements inside the list
  // (whitespace text is already filtered by `elementChildren`) are ignored
  // rather than silently treated as items — they were never list entries.
  readListValue(list, itemNode) {
    const codec = codecFor({ node: itemNode });
    return elementChildren(list)
      .filter((c) => c.tagName === 'li')
      .map((li) => {
        if (codec.fromHtml) {
          return codec.fromHtml({ nodes: li.children });
        }
        const text = textContent(li).trim();
        const ref = this.getReference(text, itemNode);
        if (ref !== null) { return ref; }
        return this.getTypedValue(text, itemNode);
      });
  }

  /**
   * Find and convert a block to its basic JSON data
   * @param {String} searchTerm the block name or variation
   * @param {Boolean} searchRef if the variation should be used for search
   * @param {Object} [node] the compiled schema node of the block's value
   * @returns {Object|Array} the JSON Object or Array representing the block
   */
  findAndConvert(searchTerm, searchRef, node) {
    return this.blocks.reduce((acc, block) => {
      // If we are looking for a reference,
      // use the variation, not the block name
      const idx = searchRef ? 1 : 0;
      const matches = block.properties.className[idx]?.toLowerCase() === searchTerm.toLowerCase();
      // Root block has a single class (e.g. "foo"); nested item blocks add a
      // second class for refs (e.g. "foo foo-abcd"). Both match on className[0],
      // so we require no second class to pick the root.
      const isRootBlock = !searchRef && !block.properties.className[1];
      if (matches && (searchRef || isRootBlock)) {
        const properties = this.getProperties(block, node);
        // If the block contains only @items, it represents an array
        // Return the array value directly instead of the object wrapper
        const keys = Object.keys(properties);
        if (keys.length === 1 && keys[0] === '@items') {
          return properties['@items'];
        }
        return properties;
      }
      return acc;
    }, {});
  }

  // We will always try to convert to a strong type.
  // The schema is responsible for knowing if it
  // is correct and converting back if necessary.
  getTypedValue(value, node) {
    // It it doesn't exist, resolve to undefined
    if (!value) {
      return '';
    }

    // Attempt boolean
    const boolean = this.getBoolean(value);
    if (boolean !== null) { return boolean; }

    // Attempt reference
    const reference = this.getReference(value, node);
    if (reference !== null) { return reference; }

    // Attempt number
    const number = this.getNumber(value);
    if (number !== null) { return number; }

    return value;
  }

  getReference(text, node) {
    if (text.startsWith(SELF_REF)) {
      const refId = text.split(SELF_REF)[1].replaceAll('/', '-');
      const reference = this.findAndConvert(refId, true, node);
      if (reference) { return reference; }
    }
    return null;
  }

  getBoolean(text) {
    if (text === 'true') { return true; }
    if (text === 'false') { return false; }
    return null;
  }

  getNumber(text) {
    const num = Number(text);
    if (!Number.isFinite(num)) { return null; }
    // Only coerce when the text is the number's canonical form. `Number()`
    // accepts forms that don't round-trip, such as "710E-3" for 0.71, "0xFF" for
    // 255 or "007" for 7, which would corrupt string codes.
    if (String(num) !== text) { return null; }
    return num;
  }
}

function verifyHtml(html) {
  if (typeof html !== 'string' || !html.trim()) {
    return 'html must be a non-empty string.';
  }
  return undefined;
}

// The href of `config.baseUrl`, undefined without one, or null when it is invalid.
function baseHrefOf(config) {
  const baseUrl = config?.baseUrl;
  return baseUrl === undefined ? undefined : httpHref(baseUrl);
}

// Why the input can't be read, or undefined when it can.
function verifyInput({ html, baseHref }) {
  const htmlError = verifyHtml(html);
  if (htmlError) {
    return htmlError;
  }

  if (baseHref === null) {
    return 'config.baseUrl must be an absolute http or https URL.';
  }

  return undefined;
}

// Convert DA wire-format HTML back to a structured JSON document. Symmetric
// pair with `convertJsonToHtml`. Returns `{ json } | { error }` so callers
// see a clear reason on failure instead of a silent null.
//
// Pass the URL of a delivered EDS page as `config.baseUrl`, for example
// `https://main--site--org.aem.page/folder/x`, to return its media bus
// images as absolute URLs, resolved like a browser resolves them on the page.
// Without it they stay relative to the page.
//
// With the document's `schema`, values of a semantic type such as `rich-text`
// are read from their cell markup instead of their text. Without a schema, or
// with one that cannot be compiled, every value is read as text.
export function convertHtmlToJson({ html, schema, config } = {}) {
  const baseHref = baseHrefOf(config);
  const error = verifyInput({ html, baseHref });
  if (error) {
    return { error };
  }

  try {
    const definition = schema ? compileSchema(schema).definition : null;
    return { json: new HTMLConverter({ html, baseHref, definition }).json };
  } catch (parseError) {
    return { error: `Failed to parse HTML: ${parseError?.message ?? parseError}` };
  }
}
