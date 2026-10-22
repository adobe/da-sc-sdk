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

const MARKS = new Map([
  ['strong', 'strong'], ['b', 'strong'],
  ['em', 'em'], ['i', 'em'],
  ['u', 'u'],
  ['s', 's'], ['strike', 's'], ['del', 's'],
  ['code', 'code'],
  ['sup', 'sup'],
  ['sub', 'sub'],
]);

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const LISTS = new Set(['ul', 'ol']);

const BLOCKS = new Set([
  'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  'blockquote', 'pre', 'figure', 'figcaption', 'address',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'dl', 'dt', 'dd',
]);

const DROPPED = new Set([
  'script', 'style', 'template', 'iframe', 'object', 'embed', 'noscript',
  'head', 'title', 'meta', 'link', 'img', 'picture', 'video', 'audio',
  'source', 'svg', 'math', 'canvas', 'input', 'button', 'select', 'textarea',
]);

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

function escapeText(value) {
  return String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function escapeAttr(value) {
  return String(value).replace(/[&"<>]/g, (c) => ({
    '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;',
  }[c]));
}

// Returns the trimmed href when it is relative or uses an allowed scheme.
export function safeHref(href) {
  if (typeof href !== 'string') { return null; }
  const trimmed = href.trim();
  if (!trimmed) { return null; }
  // Browsers ignore control chars and whitespace when sniffing the scheme.
  // eslint-disable-next-line no-control-regex
  const compact = trimmed.replace(/[\u0000-\u0020]/g, '');
  const scheme = compact.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && !SAFE_SCHEMES.has(scheme)) { return null; }
  return trimmed;
}

const isElement = (node, tag) => node?.type === 'element' && (!tag || node.tagName === tag);

const hasText = (html) => html.replace(/<[^>]*>/g, '').trim() !== '';

const trimEdges = (html) => html.replace(/^(?:\s|<br>)+|(?:\s|<br>)+$/g, '');

const linkTitle = (title) => (typeof title === 'string' ? title.replace(/[ \t\n\r\f]+/g, ' ').trim() : '');

function serializeInline(nodes) {
  return nodes.map((node) => {
    if (node.type === 'text') { return escapeText(node.value.replace(/[ \t\n\r\f]+/g, ' ')); }
    if (!isElement(node) || DROPPED.has(node.tagName)) { return ''; }
    const inner = serializeInline(node.children ?? []);
    if (node.tagName === 'br') { return '<br>'; }
    if (MARKS.has(node.tagName)) {
      const tag = MARKS.get(node.tagName);
      return hasText(inner) ? `<${tag}>${inner}</${tag}>` : inner;
    }
    if (node.tagName === 'a') {
      const href = safeHref(node.properties?.href);
      if (!href || !hasText(inner)) { return inner; }
      const title = linkTitle(node.properties?.title);
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
      return `<a href="${escapeAttr(href)}"${titleAttr}>${inner}</a>`;
    }
    return inner;
  }).join('');
}

function textBlock(nodes, tag = 'p') {
  const inner = trimEdges(serializeInline(nodes));
  return hasText(inner) ? `<${tag}>${inner}</${tag}>` : '';
}

function serializeListItem(li) {
  const segments = [];
  const nested = [];
  let run = [];
  const flush = () => {
    const inner = trimEdges(serializeInline(run));
    if (hasText(inner)) { segments.push(inner); }
    run = [];
  };
  (li.children ?? []).forEach((child) => {
    if (isElement(child) && LISTS.has(child.tagName)) {
      flush();
      // eslint-disable-next-line no-use-before-define
      const list = serializeList(child);
      if (list) { nested.push(list); }
    } else if (isElement(child) && (child.tagName === 'p' || BLOCKS.has(child.tagName))) {
      flush();
      run = child.children ?? [];
      flush();
    } else {
      run.push(child);
    }
  });
  flush();
  if (!segments.length && !nested.length) { return ''; }
  return `<li>${segments.join('<br>')}${nested.join('')}</li>`;
}

function serializeList(list) {
  const items = (list.children ?? [])
    .filter((child) => isElement(child, 'li'))
    .map(serializeListItem)
    .join('');
  return items ? `<${list.tagName}>${items}</${list.tagName}>` : '';
}

function serializeBlocks(nodes) {
  const out = [];
  let run = [];
  const flush = () => {
    out.push(textBlock(run));
    run = [];
  };
  nodes.forEach((node) => {
    if (isElement(node) && DROPPED.has(node.tagName)) { return; }
    if (isElement(node, 'p') || isElement(node, 'li')) {
      flush();
      out.push(textBlock(node.children ?? []));
    } else if (isElement(node) && HEADINGS.has(node.tagName)) {
      flush();
      out.push(textBlock(node.children ?? [], node.tagName));
    } else if (isElement(node, 'blockquote')) {
      flush();
      const inner = serializeBlocks(node.children ?? []);
      out.push(inner ? `<blockquote>${inner}</blockquote>` : '');
    } else if (isElement(node) && LISTS.has(node.tagName)) {
      flush();
      out.push(serializeList(node));
    } else if (isElement(node) && BLOCKS.has(node.tagName)) {
      flush();
      out.push(serializeBlocks(node.children ?? []));
    } else {
      run.push(node);
    }
  });
  flush();
  return out.join('');
}

function plainTextToHtml(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.split('\n').map((line) => escapeText(line.trim())).join('<br>')}</p>`)
    .join('');
}

// Canonical rich-text HTML for a list of hast nodes (e.g. a value cell's
// children). Returns '' when nothing with text content survives.
export function richTextFromNodes(nodes = []) {
  return serializeBlocks(nodes);
}

// Canonical rich-text HTML for an HTML (or plain-text) string.
export function sanitizeRichText(value) {
  if (value === null || value === undefined) { return ''; }
  const text = String(value);
  if (!text.trim()) { return ''; }
  if (!/<[a-z/!]/i.test(text)) { return plainTextToHtml(text); }
  return richTextFromNodes(fromHtml(text, { fragment: true }).children);
}
