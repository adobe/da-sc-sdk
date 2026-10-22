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
import { convertJsonToHtml } from '../../src/html/json2html.js';
import { convertHtmlToJson } from '../../src/html/html2json.js';
import { createEngine } from '../../src/state-engine/index.js';
import { TYPES } from '../../src/types/index.js';
import { save } from './test-utils.js';

const RICH = { type: 'string', 'x-semantic-type': 'rich-text' };

const schema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    body: RICH,
    author: {
      type: 'object',
      properties: { name: { type: 'string' }, bio: RICH },
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: { heading: { type: 'string' }, content: RICH },
      },
    },
    notes: { type: 'array', items: RICH },
    grid: { type: 'array', items: { type: 'array', items: RICH } },
  },
};

const doc = (data) => ({ metadata: { schemaName: 'article' }, data });

const roundtrip = (json, s = schema) => {
  const { html } = save({ json, schema: s });
  return convertHtmlToJson({ html, schema: s }).json;
};

describe('rich-text codec', () => {
  describe('convertJsonToHtml with a model', () => {
    it('writes rich-text values as markup in the value cell', () => {
      const { html } = save({
        json: doc({ title: '<b>x</b>', body: '<p>Hello <strong>bold</strong></p><ul><li>a</li></ul>' }),
        schema,
      });
      expect(html).to.include('<div><div><h3>body</h3></div><div><p>Hello <strong>bold</strong></p><ul><li>a</li></ul></div></div>');
      expect(html).to.include('<div><p>&lt;b&gt;x&lt;/b&gt;</p></div>');
    });

    it('keeps escaping rich-text values without a model', () => {
      const { html } = convertJsonToHtml({ json: doc({ body: '<p>Hi</p>' }) });
      expect(html).to.include('<div><p>&lt;p&gt;Hi&lt;/p&gt;</p></div>');
    });

    it('sanitizes rich-text values on write', () => {
      const { html } = save({
        json: doc({ body: '<p onclick="x()">a<script>alert(1)</script><a href="javascript:x">b</a></p>' }),
        schema,
      });
      expect(html).to.include('<div><p>ab</p></div>');
      expect(html).not.to.include('script');
    });

    it('converts plain-text values into paragraphs', () => {
      const { html } = save({ json: doc({ body: 'one\n\ntwo' }), schema });
      expect(html).to.include('<div><p>one</p><p>two</p></div>');
    });

    it('writes a rich-text value without text content as an empty cell', () => {
      const { html } = save({ json: doc({ title: 't', body: '<p><br></p>' }), schema });
      expect(html).to.include('<div><div><h3>body</h3></div><div></div></div>');
      expect(convertHtmlToJson({ html, schema }).json.data.body).to.equal('');
    });

    it('writes rich-text array items as markup in their list items', () => {
      const { html } = save({ json: doc({ notes: ['<p>n1</p>', 'n2'] }), schema });
      expect(html).to.include('<ul><li><p>n1</p></li><li><p>n2</p></li></ul>');
    });
  });

  describe('convertHtmlToJson with a schema', () => {
    const html = `
      <main><div>
        <div class="da-form"><div><div><p>x-schema-name</p></div><div><p>article</p></div></div></div>
        <div class="article">
          <div><div><p>title</p></div><div><p>42</p></div></div>
          <div><div><p>body</p></div><div>
            <p>Hello <b>bold</b></p>
            <ul><li>a</li><li>b</li></ul>
          </div></div>
        </div>
      </div></main>`;

    it('reads rich-text cells as canonical markup instead of an array', () => {
      const { json } = convertHtmlToJson({ html, schema });
      expect(json.data.body).to.equal('<p>Hello <strong>bold</strong></p><ul><li>a</li><li>b</li></ul>');
      expect(json.data.title).to.equal(42);
    });

    it('keeps the schema-less reading unchanged', () => {
      const { json } = convertHtmlToJson({ html });
      expect(json.data.body).to.deep.equal(['a', 'b']);
    });

    it('reads legacy plain cells as a paragraph', () => {
      const legacy = html.replace(/<div>\s*<p>Hello[\s\S]*?<\/ul>\s*<\/div>/, '<div><p>plain</p></div>');
      expect(convertHtmlToJson({ html: legacy, schema }).json.data.body).to.equal('<p>plain</p>');
    });

    it('sanitizes rich-text cells on read', () => {
      const unsafe = html.replace('<b>bold</b>', '<img src=x onerror=alert(1)><a href="javascript:x">l</a>');
      expect(convertHtmlToJson({ html: unsafe, schema }).json.data.body)
        .to.equal('<p>Hello l</p><ul><li>a</li><li>b</li></ul>');
    });

    it('reads every value as text with a schema that cannot be compiled', () => {
      const plain = convertHtmlToJson({ html }).json;
      [1, 'nope', [], null].forEach((invalid) => {
        expect(convertHtmlToJson({ html, schema: invalid }).json).to.deep.equal(plain);
      });
    });
  });

  describe('round trip', () => {
    it('preserves rich text at the root, in nested objects and in arrays', () => {
      const json = doc({
        title: 'Title',
        body: '<p>Body <em>it</em> <a href="https://adobe.com">link</a></p><ol><li>one<ul><li>two</li></ul></li></ol>',
        author: { name: 'Ann', bio: '<p><u>Bio</u></p>' },
        sections: [
          { heading: 'H1', content: '<p>First</p>' },
          { heading: 'H2', content: '<ul><li><s>Second</s></li></ul>' },
        ],
        notes: ['<p>n1</p>', '<p><strong>n2</strong></p>'],
        grid: [['<p>a</p>', '<p>b</p>'], ['<p>c</p>']],
      });
      expect(roundtrip(json)).to.deep.equal(json);
    });

    it('preserves a root array of rich text', () => {
      const rootSchema = { type: 'array', items: RICH };
      const json = doc(['<p>a</p>', '<ul><li>b</li></ul>']);
      expect(roundtrip(json, rootSchema)).to.deep.equal(json);
    });

    it('resolves rich-text definitions through $ref', () => {
      const refSchema = {
        type: 'object',
        $defs: { rich: RICH },
        properties: { body: { $ref: '#/$defs/rich' } },
      };
      const json = doc({ body: '<p>ref <strong>ok</strong></p>' });
      expect(roundtrip(json, refSchema)).to.deep.equal(json);
    });

    it('normalizes non-canonical values once and is stable afterwards', () => {
      const first = roundtrip(doc({ body: '<div><b>a</b></div>plain' }));
      expect(first.data.body).to.equal('<p><strong>a</strong></p><p>plain</p>');
      expect(roundtrip(first)).to.deep.equal(first);
    });

    it('preserves rich text next to image and file fields', () => {
      const mixedSchema = {
        type: 'object',
        properties: {
          hero: { $ref: TYPES.image.url },
          datasheet: { $ref: TYPES.file.url },
          body: RICH,
          cards: {
            type: 'array',
            items: {
              type: 'object',
              properties: { image: { $ref: TYPES.image.url }, text: RICH },
            },
          },
        },
      };
      const json = doc({
        hero: { src: '/media_1a2b.png', altText: 'Hero' },
        datasheet: { src: 'https://example.com/sheet.pdf' },
        body: '<p>Intro <strong>bold</strong></p>',
        cards: [
          { image: { src: '/media_3c4d.jpg', altText: 'Card' }, text: '<ul><li>one</li></ul>' },
        ],
      });
      expect(roundtrip(json, mixedSchema)).to.deep.equal(json);
    });

    it('survives an engine edit, save and reload', () => {
      const engine = createEngine({ schema, document: doc({ title: 't' }) });
      engine.setField('/data/body', '<p>Edited <strong>text</strong></p>');
      const { document, model } = engine.getState();
      const { html } = convertJsonToHtml({ json: document, model });
      const { json } = convertHtmlToJson({ html, schema });
      const reloaded = createEngine({ schema, document: json });
      expect(reloaded.getState().document.data.body).to.equal('<p>Edited <strong>text</strong></p>');
    });
  });
});
