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

// The canonical tag of each mark.
const MARKS = new Map([
  ['strong', 'strong'], ['b', 'strong'],
  ['em', 'em'], ['i', 'em'],
  ['u', 'u'],
  ['s', 's'], ['strike', 's'], ['del', 's'],
  ['code', 'code'],
  ['sup', 'sup'],
  ['sub', 'sub'],
]);

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

// Blocks that are unwrapped, so their content becomes blocks of its own.
const CONTAINERS = [
  'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  'figure', 'figcaption', 'address',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'dl', 'dt', 'dd',
];

// Active and embedded content, dropped with everything inside it.
const DROPPED = [
  'script', 'style', 'template', 'iframe', 'object', 'embed', 'noscript',
  'head', 'title', 'meta', 'link', 'img', 'picture', 'video', 'audio',
  'source', 'svg', 'math', 'canvas', 'input', 'button', 'select', 'textarea',
];

// What the sanitizer does with each known tag. Other tags are unwrapped.
const ROLES = new Map([
  ['p', 'paragraph'],
  ['li', 'paragraph'],
  ...HEADINGS.map((tag) => [tag, 'heading']),
  ['blockquote', 'quote'],
  ['ul', 'list'],
  ['ol', 'list'],
  ['pre', 'preformatted'],
  ...CONTAINERS.map((tag) => [tag, 'container']),
  ...[...MARKS.keys()].map((tag) => [tag, 'mark']),
  ['a', 'link'],
  ['br', 'break'],
  ...DROPPED.map((tag) => [tag, 'dropped']),
]);

const BLOCK_ROLES = new Set(['paragraph', 'heading', 'quote', 'list', 'preformatted', 'container']);

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

// A complete opening, closing or self-closing tag. Text such as `a<b then c`
// has none, so it stays plain text.
const TAG_PATTERN = /<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/i;

// HTML collapses runs of these characters into one space.
const WHITESPACE = /[ \t\n\r\f]+/g;

// A URL scheme, such as `https` in `https://example.com`.
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

// Browsers ignore control characters and spaces when they read a scheme.
// eslint-disable-next-line no-control-regex
const CONTROL_AND_SPACE = /[\u0000-\u0020]/g;

// Returns the trimmed href when it is relative or uses an allowed scheme.
export function safeHref(href) {
  if (typeof href !== 'string') {
    return null;
  }

  const trimmedHref = href.trim();
  if (!trimmedHref) {
    return null;
  }

  const comparableHref = trimmedHref.replace(CONTROL_AND_SPACE, '');
  const scheme = comparableHref.match(SCHEME)?.[1]?.toLowerCase();
  if (scheme && !SAFE_SCHEMES.has(scheme)) {
    return null;
  }

  return trimmedHref;
}

function roleOf(node) {
  if (node?.type !== 'element') {
    return undefined;
  }
  return ROLES.get(node.tagName);
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

const LINE_BREAK = element('br', []);

function isLineBreak(node) {
  return node.tagName === 'br';
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

// A link with a safe href and text keeps its title. Any other link is unwrapped.
function canonicalLink(link, children) {
  const href = safeHref(link.properties?.href);
  if (!href || !hasText(children)) {
    return children;
  }

  const title = linkTitle(link.properties?.title);
  const properties = title ? { href, title } : { href };
  return [element('a', children, properties)];
}

// A mark with text keeps its canonical tag. A mark without text is unwrapped.
function canonicalMark(mark, children) {
  if (!hasText(children)) {
    return children;
  }
  return [element(MARKS.get(mark.tagName), children)];
}

// Inline nodes in canonical form: text with collapsed whitespace, line breaks,
// and marks and links that hold text. Any other element is unwrapped or dropped.
function canonicalInline(nodes) {
  return nodes.flatMap((node) => {
    if (isText(node)) {
      const value = node.value.replace(WHITESPACE, ' ');
      return [{ type: 'text', value }];
    }

    const role = roleOf(node);
    if (node.type !== 'element' || role === 'dropped') {
      return [];
    }
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
    .filter((child) => child.type === 'element' && child.tagName === 'li')
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
  return serializeBlocks(nodes);
}

// Canonical rich-text HTML for an HTML (or plain-text) string.
export function sanitizeRichText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  if (!text.trim()) {
    return '';
  }
  if (!TAG_PATTERN.test(text)) {
    return plainTextToHtml(text);
  }

  const { children } = fromHtml(text, { fragment: true });
  return richTextFromNodes(children);
}
