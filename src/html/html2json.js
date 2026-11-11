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
import { markupCodecFor } from './codecs/index.js';

const SELF_REFERENCE_PATTERN = /^self:\/\/([a-z-]*)#(.*)$/;

// A referenced block's second class is its reference ID.
function blockReferenceId(block) {
  return block.properties.className[1]?.toLowerCase();
}

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
function nodeText(node) {
  if (!node) {
    return '';
  }
  if (node.type === 'text') {
    return node.value ?? '';
  }
  return (node.children ?? []).map(nodeText).join('');
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
  constructor({ html }) {
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
    return elementChildren(block).reduce((properties, row) => {
      const cells = elementChildren(row);
      if (cells.length < 2) {
        return properties;
      }

      const [keyCell, valueCell] = cells;
      const key = nodeText(keyCell).trim();
      if (!key) {
        return properties;
      }

      properties[key] = this.readValue({ valueCell });
      return properties;
    }, {});
  }

  // Read a value cell. A `<ul>` or `<ol>` child makes it an array. Otherwise
  // the cell's text is the value.
  readValue({ valueCell }) {
    const list = firstListChild(valueCell);
    if (list) {
      return this.readListValue(list);
    }

    const text = nodeText(valueCell).trim();
    if (text === '') {
      return '';
    }
    return this.getTypedValue(text);
  }

  // Iterate only `<li>` children. Stray non-`<li>` elements inside the list
  // (whitespace text is already filtered by `elementChildren`) are ignored
  // rather than silently treated as items — they were never list entries.
  readListValue(list) {
    return elementChildren(list)
      .filter((child) => child.tagName === 'li')
      .map((li) => {
        const text = nodeText(li).trim();
        return this.getTypedValue(text);
      });
  }

  /**
   * Find and convert a block to its basic JSON data
   * @param {String} searchTerm the block name or variation
   * @param {Boolean} byReferenceId if the variation should be used for search
   * @returns {Object|Array} the JSON Object or Array representing the block
   */
  findAndConvert(searchTerm, byReferenceId) {
    return this.blocks.reduce((lastMatch, block) => {
      // If we are looking for a reference,
      // use the variation, not the block name
      const classIndex = byReferenceId ? 1 : 0;
      const matches = block.properties.className[classIndex]?.toLowerCase()
        === searchTerm.toLowerCase();
      // Root block has a single class (e.g. "foo"); nested item blocks add a
      // second class for refs (e.g. "foo foo-abcd"). Both match on className[0],
      // so we require no second class to pick the root.
      const isRootBlock = !byReferenceId && !block.properties.className[1];
      if (matches && (byReferenceId || isRootBlock)) {
        const properties = this.getProperties(block);
        // If the block contains only @items, it represents an array
        // Return the array value directly instead of the object wrapper
        const keys = Object.keys(properties);
        if (keys.length === 1 && keys[0] === '@items') {
          return properties['@items'];
        }
        return properties;
      }
      return lastMatch;
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

  // Resolve a `self://` reference, or return null when the text is not one.
  // A typed reference, `self://<semantic-type>#…`, reads its block's cell with
  // the codec of that type. References of an unknown type stay text.
  getReference(text) {
    const [, semanticType, fragment] = text.match(SELF_REFERENCE_PATTERN) ?? [];
    if (fragment === undefined) {
      return null;
    }

    const referenceId = fragment.replaceAll('/', '-');
    if (semanticType) {
      return this.readMarkupBlock({ semanticType, referenceId });
    }

    const reference = this.findAndConvert(referenceId, true);
    if (reference) {
      return reference;
    }
    return null;
  }

  // The markup in the cell of the referenced block, read with the codec of
  // `semanticType`, or null without such a codec or block.
  readMarkupBlock({ semanticType, referenceId }) {
    const codec = markupCodecFor(semanticType);
    if (!codec) {
      return null;
    }

    // Like findAndConvert, the last block with the reference ID wins.
    const block = this.blocks.findLast(
      (candidate) => blockReferenceId(candidate) === referenceId.toLowerCase(),
    );
    const [row] = elementChildren(block);
    const [cell] = elementChildren(row);
    return cell ? codec.fromHtml({ nodes: cell.children }) : null;
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
export function convertHtmlToJson({ html } = {}) {
  if (typeof html !== 'string' || !html.trim()) {
    return { error: 'html must be a non-empty string.' };
  }
  try {
    return { json: new HTMLConverter({ html }).json };
  } catch (e) {
    return { error: `Failed to parse HTML: ${e?.message ?? e}` };
  }
}
