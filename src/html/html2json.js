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
import { normalizeMediaSource, toAbsoluteMediaUrl } from './media.js';
import { httpHref } from './utils.js';

// `self://<type>#<id>` references the block with the class `<id>`. Objects and
// arrays have no type. `asset` marks a block that holds a single asset.
const SELF_REF = /^self:\/\/([a-z]*)#(.+)$/;

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
// With an `assetBase`, media bus paths become absolute URLs resolved against it.
function imageSource(node, assetBase) {
  const images = [];
  collectElements(node, 'img', images);
  const src = images
    .map((img) => img.properties?.src)
    .find((value) => typeof value === 'string' && value.trim() !== '');
  if (src !== undefined) {
    return toAbsoluteMediaUrl(normalizeMediaSource(src), assetBase);
  }
  return null;
}

// The first non-empty `<a href>` below `node`, trimmed, or null.
function linkHref(node) {
  const links = [];
  collectElements(node, 'a', links);
  const href = links
    .map((link) => link.properties?.href)
    .find((value) => typeof value === 'string' && value.trim() !== '');
  return href?.trim() ?? null;
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

export default class HTMLConverter {
  constructor(html, { assetBase } = {}) {
    this.assetBase = assetBase;
    this.tree = fromHtml(html);
    this.blocks = selectBlocks(this.tree);
    this.json = this.convertBlocksToJson();
  }

  convertBlocksToJson() {
    const metadata = this.getMetadata();
    const data = this.findAndConvert(metadata.schemaName);
    return { metadata, data };
  }

  getMetadata() {
    const baseMeta = this.findAndConvert('da-form');
    const { 'x-schema-name': schemaName, ...rest } = baseMeta;
    return { schemaName, ...rest };
  }

  getProperties(block) {
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
      rdx[key] = this.readValue(valCol);
      return rdx;
    }, {});
  }

  // Read an asset block: one row per property, of which only `asset` is read
  // for now. Other rows are skipped, so properties added later don't break
  // this reader. A block without an `asset` row reads as an empty asset.
  readAssetBlock(block) {
    const assetRow = elementChildren(block)
      .map((row) => elementChildren(row))
      .find((cols) => cols.length >= 2 && textContent(cols[0]).trim() === 'asset');
    return assetRow ? this.readAssetValue(assetRow[1]) : '';
  }

  // Read an asset cell: the image source, else the link target, else the
  // text. The reference says the block holds an asset, so an image or link
  // wins over any text next to it.
  readAssetValue(cell) {
    const src = imageSource(cell, this.assetBase);
    if (src !== null) { return src; }
    const href = linkHref(cell);
    if (href !== null) { return toAbsoluteMediaUrl(normalizeMediaSource(href), this.assetBase); }
    return textContent(cell).trim();
  }

  // Read a value cell. A `<ul>` or `<ol>` child makes it an array. Otherwise
  // the cell's text is the value; a cell without text but with an `<img>`
  // reads as the image source. Text always wins, so an image never replaces
  // authored text.
  readValue(valCol) {
    const list = firstListChild(valCol);
    if (list) { return this.readListValue(list); }

    const text = textContent(valCol).trim();
    if (text === '') { return imageSource(valCol, this.assetBase) ?? ''; }
    return this.getTypedValue(text);
  }

  // Iterate only `<li>` children. Stray non-`<li>` elements inside the list
  // (whitespace text is already filtered by `elementChildren`) are ignored
  // rather than silently treated as items — they were never list entries.
  readListValue(list) {
    return elementChildren(list)
      .filter((c) => c.tagName === 'li')
      .map((li) => {
        const text = textContent(li).trim();
        const src = text === '' ? imageSource(li, this.assetBase) : null;
        if (src !== null) { return src; }
        const ref = this.getReference(text);
        if (ref !== null) { return ref; }
        return this.getTypedValue(text);
      });
  }

  /**
   * Find and convert a block to its basic JSON data
   * @param {String} searchTerm the block name or variation
   * @param {Boolean} searchRef if the variation should be used for search
   * @returns {Object|Array} the JSON Object or Array representing the block
   */
  findAndConvert(searchTerm, searchRef) {
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
        const properties = this.getProperties(block);
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
  getTypedValue(value) {
    // It it doesn't exist, resolve to undefined
    if (!value) {
      return '';
    }

    // Attempt boolean
    const boolean = this.getBoolean(value);
    if (boolean !== null) { return boolean; }

    // Attempt reference
    const reference = this.getReference(value);
    if (reference !== null) { return reference; }

    // Attempt number
    const number = this.getNumber(value);
    if (number !== null) { return number; }

    return value;
  }

  // Resolve a `self://` reference, or return null when the text is not one or
  // its block is missing. References of an unknown type are left as text.
  getReference(text) {
    const [, type, id] = text.match(SELF_REF) ?? [];
    if (id === undefined) { return null; }
    const refId = id.replaceAll('/', '-');
    if (type === 'asset') {
      const block = this.findReferencedBlock(refId);
      return block ? this.readAssetBlock(block) : null;
    }
    if (type !== '') { return null; }
    const reference = this.findAndConvert(refId, true);
    if (reference) { return reference; }
    return null;
  }

  // The last block whose variation is `refId`, matching `findAndConvert`.
  findReferencedBlock(refId) {
    return this.blocks
      .filter((block) => block.properties.className[1]?.toLowerCase() === refId.toLowerCase())
      .at(-1);
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
    // accepts forms that don't round-trip (e.g. "710E-3" -> 0.71, "0xFF" ->
    // 255, "007" -> 7), which would corrupt string codes.
    if (String(num) !== text) { return null; }
    return num;
  }
}

// Convert DA wire-format HTML back to a structured JSON document. Symmetric
// pair with `convertJsonToHtml`. Returns `{ json } | { error }` so callers
// see a clear reason on failure instead of a silent null.
//
// Pass the URL of a delivered EDS page as `asset.base`, for example
// `https://main--site--org.aem.page/folder/x`, to return its media bus
// images as absolute URLs, resolved like a browser resolves them on the page.
// Without it they stay relative to the page.
export function convertHtmlToJson({ html, asset } = {}) {
  if (typeof html !== 'string' || !html.trim()) {
    return { error: 'html must be a non-empty string.' };
  }
  const assetBase = asset?.base !== undefined ? httpHref(asset.base) : undefined;
  if (assetBase === null) {
    return { error: 'asset.base must be an absolute http or https URL.' };
  }
  try {
    return { json: new HTMLConverter(html, { assetBase }).json };
  } catch (e) {
    return { error: `Failed to parse HTML: ${e?.message ?? e}` };
  }
}
