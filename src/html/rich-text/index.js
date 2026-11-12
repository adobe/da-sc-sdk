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

// Canonical HTML for `x-semantic-type: rich-text` values.
//
// Both codec directions run values through the same allowlist so the stored
// string is always the canonical form:
//
//   blocks:  <p>, <h1>-<h6>, <blockquote>, <ul>, <ol>, <li>
//   inline:  <strong>, <em>, <u>, <s>, <code>, <sup>, <sub>, <a href title>, <br>
//
// Equivalent tags are normalized (b → strong, i → em, strike/del → s),
// unknown wrappers are unwrapped, unsafe link schemes and active content are
// dropped, loose inline content is wrapped in <p>, and empty paragraphs/items
// are removed. Plain text without markup becomes paragraphs split on blank
// lines, with single newlines kept as <br>.

import { fromHtml } from 'hast-util-from-html';
import { escapeAttr, escapeText } from '../markup.js';
import { ALLOWLIST } from './allowlist.js';
import { CONTAINERS, PREFORMATTED, sanitizeNodes } from './sanitize.js';

const MARK_TAGS = [...ALLOWLIST.marks, ...Object.keys(ALLOWLIST.aliases)];

// What normalizing does with each tag that sanitizing keeps.
const ROLES = new Map([
  [ALLOWLIST.paragraph, 'paragraph'],
  [ALLOWLIST.listItem, 'paragraph'],
  ...ALLOWLIST.headings.map((tag) => [tag, 'heading']),
  [ALLOWLIST.quote, 'quote'],
  ...ALLOWLIST.lists.map((tag) => [tag, 'list']),
  [PREFORMATTED, 'preformatted'],
  ...CONTAINERS.map((tag) => [tag, 'container']),
  ...MARK_TAGS.map((tag) => [tag, 'mark']),
  [ALLOWLIST.link.tagName, 'link'],
  [ALLOWLIST.lineBreak, 'break'],
]);

const BLOCK_ROLES = new Set(['paragraph', 'heading', 'quote', 'list', 'preformatted', 'container']);

// HTML collapses runs of these characters into one space.
const WHITESPACE = /[ \t\n\r\f]+/g;

function isElement(node) {
  return node.type === 'element';
}

function roleOf(node) {
  if (!isElement(node)) {
    return undefined;
  }
  return ROLES.get(node.tagName);
}

function canonicalMarkTag(tagName) {
  return ALLOWLIST.aliases[tagName] ?? tagName;
}

function isBlock(node) {
  return BLOCK_ROLES.has(roleOf(node));
}

function isText(node) {
  return node.type === 'text';
}

function isBlankText(text) {
  return !/\S/.test(text);
}

function element(tagName, children, properties = {}) {
  return {
    type: 'element',
    tagName,
    properties,
    children,
  };
}

const LINE_BREAK = element(ALLOWLIST.lineBreak, []);

function isLineBreak(node) {
  return node.tagName === ALLOWLIST.lineBreak;
}

// Whether canonical inline nodes hold any text that is not whitespace.
function hasText(nodes) {
  return nodes.some((node) => {
    if (isText(node)) {
      return !isBlankText(node.value);
    }
    return hasText(node.children);
  });
}

function linkTitle(title) {
  if (typeof title !== 'string') {
    return '';
  }
  return title.replace(WHITESPACE, ' ').trim();
}

// A link with an href and text keeps its title. Any other link is unwrapped.
// Sanitizing has already removed an href with a protocol outside the allowlist.
function canonicalLink(link, children) {
  const href = link.properties?.href?.trim();
  if (!href || !hasText(children)) {
    return children;
  }

  const title = linkTitle(link.properties?.title);
  const properties = title ? { href, title } : { href };
  return [element(ALLOWLIST.link.tagName, children, properties)];
}

// A mark with text keeps its canonical tag. A mark without text is unwrapped.
function canonicalMark(mark, children) {
  if (!hasText(children)) {
    return children;
  }
  return [element(canonicalMarkTag(mark.tagName), children)];
}

// Inline nodes in canonical form: text with collapsed whitespace, line breaks,
// and marks and links that hold text. Any other element is unwrapped.
function canonicalInline(nodes) {
  return nodes.flatMap((node) => {
    if (isText(node)) {
      const value = node.value.replace(WHITESPACE, ' ');
      return [{ type: 'text', value }];
    }

    if (!isElement(node)) {
      return [];
    }

    const role = roleOf(node);
    if (role === 'break') {
      return [LINE_BREAK];
    }

    const children = canonicalInline(node.children ?? []);
    if (role === 'mark') {
      return canonicalMark(node, children);
    }
    if (role === 'link') {
      return canonicalLink(node, children);
    }
    return children;
  });
}

// Line breaks and whitespace-only text at either end of a run of inline nodes.
function isEdgeSpace(node) {
  if (isLineBreak(node)) {
    return true;
  }
  return isText(node) && isBlankText(node.value);
}

// Canonical inline nodes without line breaks and whitespace at either end.
function trimInline(nodes) {
  let first = 0;
  let last = nodes.length - 1;
  while (first <= last && isEdgeSpace(nodes[first])) {
    first += 1;
  }
  while (last >= first && isEdgeSpace(nodes[last])) {
    last -= 1;
  }

  const trimmed = nodes.slice(first, last + 1);
  return trimmed.map((node, index) => {
    if (!isText(node)) {
      return node;
    }

    let { value } = node;
    if (index === 0) {
      value = value.trimStart();
    }
    if (index === trimmed.length - 1) {
      value = value.trimEnd();
    }
    return { ...node, value };
  });
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
    if (isText(node)) {
      return textWithLineBreaks(node.value);
    }
    if (node.type === 'element') {
      const children = preformattedNodes(node.children ?? []);
      return [{ ...node, children }];
    }
    return [node];
  });
}

function attributesHtml(properties) {
  return Object.entries(properties)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join('');
}

function serializeInline(nodes) {
  return nodes.map((node) => {
    if (isText(node)) {
      return escapeText(node.value);
    }
    if (isLineBreak(node)) {
      return '<br>';
    }

    const attributes = attributesHtml(node.properties);
    const content = serializeInline(node.children);
    return `<${node.tagName}${attributes}>${content}</${node.tagName}>`;
  }).join('');
}

// The canonical markup of inline content, or '' when it holds no text.
function inlineHtml(nodes) {
  const inline = trimInline(canonicalInline(nodes));
  if (!hasText(inline)) {
    return '';
  }
  return serializeInline(inline);
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
  if (!children.some(isElement)) {
    return plainTextToHtml(text);
  }
  return richTextFromNodes(children);
}
