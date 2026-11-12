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

// Canonical HTML for rich text, the values of `x-semantic-type: html`.
//
// Both codec directions run values through the same steps, so the stored
// string is always the canonical form, written the way EDS writes it.
// allowlist.js lists the tags it keeps, sanitize.js removes everything unsafe,
// inline.js writes marks and this module writes the blocks. Unknown wrappers
// are unwrapped, loose inline content is wrapped in <p>, and empty paragraphs
// and items are removed. Plain text without markup becomes paragraphs split
// on blank lines, with single newlines kept as <br>.

import { fromHtml } from 'hast-util-from-html';
import { escapeText } from '../markup.js';
import { ALLOWLIST } from './allowlist.js';
import { inlineHtml } from './inline.js';
import { CONTAINERS, PREFORMATTED, sanitizeNodes } from './sanitize.js';

// The role of each block tag, which decides how the block is written. A tag
// without a role, such as <strong> or <span>, is inline content.
const BLOCK_ROLES = new Map([
  [ALLOWLIST.paragraph, 'paragraph'],
  [ALLOWLIST.listItem, 'paragraph'],
  ...ALLOWLIST.headings.map((tag) => [tag, 'heading']),
  [ALLOWLIST.quote, 'quote'],
  ...ALLOWLIST.lists.map((tag) => [tag, 'list']),
  [PREFORMATTED, 'preformatted'],
  ...CONTAINERS.map((tag) => [tag, 'container']),
]);

const LINE_BREAK = {
  type: 'element',
  tagName: ALLOWLIST.lineBreak,
  properties: {},
  children: [],
};

function isElement(node) {
  return node.type === 'element';
}

function roleOf(node) {
  if (!isElement(node)) {
    return undefined;
  }
  return BLOCK_ROLES.get(node.tagName);
}

function isBlock(node) {
  return roleOf(node) !== undefined;
}

function textWithLineBreaks(text) {
  const nodes = [];
  text.split('\n').forEach((line, index) => {
    if (index > 0) {
      nodes.push(LINE_BREAK);
    }
    nodes.push({ type: 'text', value: line });
  });
  return nodes;
}

// The nodes of preformatted text with each line break as a `<br>`, so the
// breaks survive the whitespace collapsing of inline text.
function preformattedNodes(nodes) {
  return nodes.flatMap((node) => {
    if (node.type === 'text') {
      return textWithLineBreaks(node.value);
    }
    // EDS writes a code block as `<pre><code>`. That code is the block's, not a mark.
    if (isElement(node) && node.tagName === 'code') {
      return preformattedNodes(node.children ?? []);
    }
    if (isElement(node)) {
      const children = preformattedNodes(node.children ?? []);
      return [{ ...node, children }];
    }
    return [node];
  });
}

function textBlock(nodes, tag = 'p') {
  const html = inlineHtml(nodes);
  if (!html) {
    return '';
  }
  return `<${tag}>${html}</${tag}>`;
}

// The block nodes, with each run of inline nodes between them as one array.
function groupInline(nodes) {
  const groups = [];
  nodes.forEach((node) => {
    const lastGroup = groups.at(-1);
    if (isBlock(node)) {
      groups.push(node);
    } else if (Array.isArray(lastGroup)) {
      lastGroup.push(node);
    } else {
      groups.push([node]);
    }
  });
  return groups;
}

// The text segments and nested lists of a list item's content, in order.
// Blocks inside the item are walked the same way, so their lists stay lists.
function listItemParts(nodes) {
  return groupInline(nodes).flatMap((group) => {
    if (Array.isArray(group)) {
      return [{ segment: inlineHtml(group) }];
    }
    if (roleOf(group) === 'list') {
      // eslint-disable-next-line no-use-before-define
      return [{ list: serializeList(group) }];
    }
    return listItemParts(group.children ?? []);
  });
}

// A list item keeps its text as segments joined by `<br>`, followed by its
// nested lists.
function serializeListItem(item) {
  const parts = listItemParts(item.children ?? []);
  const segments = parts.map((part) => part.segment).filter(Boolean);
  const nestedLists = parts.map((part) => part.list).filter(Boolean);

  const text = segments.join('<br>');
  const lists = nestedLists.join('');
  if (!text && !lists) {
    return '';
  }
  return `<li>${text}${lists}</li>`;
}

function serializeList(list) {
  const items = (list.children ?? [])
    .filter((child) => isElement(child) && child.tagName === ALLOWLIST.listItem)
    .map(serializeListItem)
    .join('');
  if (!items) {
    return '';
  }
  return `<${list.tagName}>${items}</${list.tagName}>`;
}

function serializeQuote(quote) {
  // eslint-disable-next-line no-use-before-define
  const content = serializeBlocks(quote.children ?? []);
  if (!content) {
    return '';
  }
  return `<blockquote>${content}</blockquote>`;
}

function serializeBlock(node) {
  const children = node.children ?? [];
  switch (roleOf(node)) {
    case 'paragraph':
      return textBlock(children);
    case 'heading':
      return textBlock(children, node.tagName);
    case 'quote':
      return serializeQuote(node);
    case 'list':
      return serializeList(node);
    case 'preformatted':
      return textBlock(preformattedNodes(children));
    default:
      // eslint-disable-next-line no-use-before-define
      return serializeBlocks(children);
  }
}

// Blocks in canonical form. Inline nodes between blocks become a paragraph.
function serializeBlocks(nodes) {
  return groupInline(nodes)
    .map((group) => {
      if (Array.isArray(group)) {
        return textBlock(group);
      }
      return serializeBlock(group);
    })
    .join('');
}

// A paragraph of plain text, with each line break kept as `<br>`.
function plainParagraph(text) {
  const lines = text.split('\n').map((line) => escapeText(line.trim()));
  return `<p>${lines.join('<br>')}</p>`;
}

// Plain text becomes paragraphs split on blank lines.
function plainTextToHtml(text) {
  const normalized = text.replace(/\r\n?/g, '\n');
  const paragraphs = normalized
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return paragraphs.map(plainParagraph).join('');
}

// Canonical rich-text HTML for a list of hast nodes (e.g. a value cell's
// children). Returns '' when nothing with text content survives.
export function richTextFromNodes(nodes = []) {
  return serializeBlocks(sanitizeNodes(nodes));
}

// Canonical rich-text HTML for an HTML (or plain-text) string. A value that
// parses without an element, such as `if a<b then c`, is plain text, the same
// rule the editor applies.
export function sanitizeRichText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  if (!text.trim()) {
    return '';
  }

  const { children } = fromHtml(text, { fragment: true });
  if (children.some(isElement)) {
    return richTextFromNodes(children);
  }

  // Plain text goes through the same normalizing once it is paragraphs, so
  // spaces collapse the way they do in HTML.
  const paragraphs = fromHtml(plainTextToHtml(text), { fragment: true });
  return richTextFromNodes(paragraphs.children);
}
