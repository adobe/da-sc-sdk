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

import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { fromHtml } from 'hast-util-from-html';
import { ALLOWED_TAG_NAMES } from '../../../src/html/rich-text/allowlist.js';
import { richTextFromNodes } from '../../../src/html/rich-text/index.js';

// richText.da.html holds rich text as the SDK stores it, one value per block
// cell. richText.eds.html is the same page as EDS delivered it after preview.
// To refresh it after EDS changes, store richText.da.html on a DA page, preview
// it and save the page's .plain.html as richText.eds.html.

// Cases where EDS changes the text itself, which the SDK does not copy. EDS
// puts spaces around a mark inside a word and drops a line break at the end
// of a mark.
const EDS_TEXT_CHANGES = ['split-mark', 'link-split', 'br-end-mark'];

function elementChildren(node) {
  return (node.children ?? []).filter((child) => child.type === 'element');
}

function textOf(node) {
  if (node.type === 'text') {
    return node.value;
  }
  return (node.children ?? []).map(textOf).join('');
}

// The value cell of each block, by the case name in its key cell.
function valueCells(html) {
  const cells = new Map();
  const visit = (node) => {
    if (node.properties?.className?.[0] === 'rich-text') {
      const [row] = elementChildren(node);
      const [keyCell, valueCell] = elementChildren(row);
      cells.set(textOf(keyCell).trim(), valueCell);
      return;
    }
    elementChildren(node).forEach(visit);
  };
  visit(fromHtml(html));
  return cells;
}

function tagNamesOf(node, tagNames = new Set()) {
  if (node.type === 'element') {
    tagNames.add(node.tagName);
  }
  (node.children ?? []).forEach((child) => tagNamesOf(child, tagNames));
  return tagNames;
}

describe('rich-text allowlist', () => {
  let stored;
  let delivered;

  before(async () => {
    stored = valueCells(await readFile({ path: '../mocks/richText.da.html' }));
    delivered = valueCells(await readFile({ path: '../mocks/richText.eds.html' }));
  });

  it('lists only tags EDS keeps', () => {
    const deliveredTags = new Set();
    delivered.forEach((cell) => tagNamesOf(cell, deliveredTags));
    const droppedByEds = ALLOWED_TAG_NAMES.filter((tagName) => !deliveredTags.has(tagName));
    expect(droppedByEds).to.deep.equal([]);
  });

  it('reads a value back from a page EDS delivered as it was stored', () => {
    const changed = [...stored.keys()].filter((name) => {
      const value = richTextFromNodes(stored.get(name).children);
      const readBack = richTextFromNodes(delivered.get(name).children);
      return value !== readBack;
    });
    expect(changed).to.deep.equal(EDS_TEXT_CHANGES);
  });
});
