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

// Inline content in the form EDS writes it. Text and line breaks are split
// into leaves that each carry the marks they are in, so marks can be merged,
// ordered and kept off surrounding spaces before they become tags again.

import { escapeAttr, escapeText } from '../markup.js';
import { ALLOWLIST } from './allowlist.js';

// HTML collapses runs of these characters into one space.
const WHITESPACE = /[ \t\n\r\f]+/g;

// The whitespace at the start and at the end of a text, around its content.
const EDGE_SPACES = /^(\s*)(.*?)(\s*)$/s;

// Code keeps the spaces at its edges, as EDS does.
const CODE = 'code';

const LINK = ALLOWLIST.link.tagName;

// Each mark's place in the order EDS nests marks on the same text, outermost first.
const MARK_RANKS = new Map(ALLOWLIST.marks.map((tagName, rank) => [tagName, rank]));

function isElement(node) {
  return node.type === 'element';
}

function isBlank(text) {
  return !/\S/.test(text);
}

function isBlankLeaf(leaf) {
  return leaf.isBreak || isBlank(leaf.text);
}

function hasText(leaves) {
  return leaves.some((leaf) => !isBlankLeaf(leaf));
}

function isSameMark(mark, other) {
  return mark.tagName === other.tagName
    && mark.properties.href === other.properties.href
    && mark.properties.title === other.properties.title;
}

function hasMark(leaf, mark) {
  return leaf.marks.some((other) => isSameMark(other, mark));
}

function linkTitle(title) {
  if (typeof title !== 'string') {
    return '';
  }
  return title.replace(WHITESPACE, ' ').trim();
}

// A link mark with its trimmed href and title, or undefined without an href.
// Sanitizing has already removed an href with a protocol outside the allowlist.
function linkMark(link) {
  const href = link.properties?.href?.trim();
  if (!href) {
    return undefined;
  }

  const title = linkTitle(link.properties?.title);
  const properties = title ? { href, title } : { href };
  return { tagName: LINK, properties };
}

// The mark an element stands for, or undefined for an element to unwrap.
function markOf(node) {
  if (node.tagName === LINK) {
    return linkMark(node);
  }

  const tagName = ALLOWLIST.aliases[node.tagName] ?? node.tagName;
  if (!MARK_RANKS.has(tagName)) {
    return undefined;
  }
  return { tagName, properties: {} };
}

// The text and line breaks of inline nodes, each with the marks it is in.
function toLeaves(nodes, marks = []) {
  return nodes.flatMap((node) => {
    if (node.type === 'text') {
      return [{ text: node.value.replace(WHITESPACE, ' '), marks }];
    }
    if (!isElement(node)) {
      return [];
    }
    if (node.tagName === ALLOWLIST.lineBreak) {
      return [{ isBreak: true, marks }];
    }

    const mark = markOf(node);
    const isNewMark = mark !== undefined && !marks.some((other) => isSameMark(other, mark));
    const childMarks = isNewMark ? [...marks, mark] : marks;
    return toLeaves(node.children ?? [], childMarks);
  });
}

// Drops a space after another space or a line break, as HTML shows it.
function collapseSpaces(leaves) {
  const collapsed = [];
  leaves.forEach((leaf) => {
    if (leaf.isBreak) {
      collapsed.push(leaf);
      return;
    }

    const previous = collapsed.at(-1);
    const followsSpace = previous !== undefined
      && (previous.isBreak || previous.text.endsWith(' '));
    const text = followsSpace ? leaf.text.replace(/^ /, '') : leaf.text;
    if (text) {
      collapsed.push({ ...leaf, text });
    }
  });
  return collapsed;
}

// Drops line breaks and whitespace at both ends.
function trimEdges(leaves) {
  let first = 0;
  let last = leaves.length - 1;
  while (first <= last && isBlankLeaf(leaves[first])) {
    first += 1;
  }
  while (last >= first && isBlankLeaf(leaves[last])) {
    last -= 1;
  }

  const trimmed = leaves.slice(first, last + 1);
  return trimmed.map((leaf, index) => {
    if (leaf.isBreak) {
      return leaf;
    }

    let { text } = leaf;
    if (index === 0) {
      text = text.trimStart();
    }
    if (index === trimmed.length - 1) {
      text = text.trimEnd();
    }
    return { ...leaf, text };
  });
}

// Splits the whitespace at both ends of each text into leaves of its own.
function splitEdgeSpaces(leaves) {
  return leaves.flatMap((leaf) => {
    if (isBlankLeaf(leaf)) {
      return [leaf];
    }

    const [, leading, content, trailing] = leaf.text.match(EDGE_SPACES);
    return [leading, content, trailing]
      .filter((text) => text !== '')
      .map((text) => ({ ...leaf, text }));
  });
}

// The range [start, end) of the leaves around `index` that carry `mark`.
function runAround(leaves, index, mark) {
  let start = index;
  let end = index + 1;
  while (start > 0 && hasMark(leaves[start - 1], mark)) {
    start -= 1;
  }
  while (end < leaves.length && hasMark(leaves[end], mark)) {
    end += 1;
  }
  return [start, end];
}

// A mark must hold text, and holds a space only between its text, as EDS
// writes it. Code keeps the spaces at its edges.
function keepsMark(leaves, index, mark) {
  const [start, end] = runAround(leaves, index, mark);
  const leaf = leaves[index];
  const isSpace = !leaf.isBreak && isBlank(leaf.text);
  if (!isSpace || mark.tagName === CODE) {
    return hasText(leaves.slice(start, end));
  }

  const hasTextBefore = hasText(leaves.slice(start, index));
  const hasTextAfter = hasText(leaves.slice(index + 1, end));
  return hasTextBefore && hasTextAfter;
}

function dropEmptyMarks(leaves) {
  return leaves.map((leaf, index) => {
    const marks = leaf.marks.filter((mark) => keepsMark(leaves, index, mark));
    return { ...leaf, marks };
  });
}

// The mark to open at `start`. A mark over more leaves wraps the shorter ones,
// and marks over the same leaves nest in EDS's order.
function outermostMark(leaves, start) {
  const candidates = leaves[start].marks.map((mark) => {
    const [, end] = runAround(leaves, start, mark);
    return { mark, end, rank: MARK_RANKS.get(mark.tagName) };
  });
  candidates.sort((a, b) => b.end - a.end || a.rank - b.rank);
  return candidates[0];
}

function withoutMark(leaf, mark) {
  const marks = leaf.marks.filter((other) => !isSameMark(other, mark));
  return { ...leaf, marks };
}

function leafNode(leaf) {
  if (leaf.isBreak) {
    return {
      type: 'element', tagName: ALLOWLIST.lineBreak, properties: {}, children: [],
    };
  }
  return { type: 'text', value: leaf.text };
}

// The leaves as nodes, with each mark as one element around the neighbouring
// leaves that share it.
function nestMarks(leaves) {
  const nodes = [];
  let start = 0;
  while (start < leaves.length) {
    const outermost = outermostMark(leaves, start);
    if (outermost === undefined) {
      nodes.push(leafNode(leaves[start]));
      start += 1;
    } else {
      const { mark, end } = outermost;
      const inner = leaves.slice(start, end).map((leaf) => withoutMark(leaf, mark));
      nodes.push({
        type: 'element',
        tagName: mark.tagName,
        properties: mark.properties,
        children: nestMarks(inner),
      });
      start = end;
    }
  }
  return nodes;
}

function attributesHtml(properties) {
  return Object.entries(properties)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join('');
}

function serializeNodes(nodes) {
  return nodes.map((node) => {
    if (node.type === 'text') {
      return escapeText(node.value);
    }
    if (node.tagName === ALLOWLIST.lineBreak) {
      return '<br>';
    }

    const attributes = attributesHtml(node.properties);
    const content = serializeNodes(node.children);
    return `<${node.tagName}${attributes}>${content}</${node.tagName}>`;
  }).join('');
}

// The canonical markup of inline content, or '' when it holds no text.
export function inlineHtml(nodes) {
  const leaves = toLeaves(nodes);
  const trimmed = trimEdges(collapseSpaces(leaves));
  const marked = dropEmptyMarks(splitEdgeSpaces(trimmed));
  if (!hasText(marked)) {
    return '';
  }
  return serializeNodes(nestMarks(marked));
}
