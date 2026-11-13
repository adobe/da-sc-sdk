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
  return convertHtmlToJson({ html }).json;
};

describe('rich-text codec', () => {
  describe('convertJsonToHtml with a model', () => {
    it('writes rich-text values as markup in a block referenced with their type', () => {
      const { html } = save({
        json: doc({ title: '<b>x</b>', body: '<p>Hello <strong>bold</strong></p><ul><li>a</li></ul>' }),
        schema,
      });
      expect(html).to.include('<div><div><h3>body</h3></div><div><p>self://rich-text#body-1</p></div></div>');
      expect(html).to.include('<div class="body body-1"><div><div><p>Hello <strong>bold</strong></p><ul><li>a</li></ul></div></div></div>');
      expect(html).to.include('<div><p>&lt;b&gt;x&lt;/b&gt;</p></div>');
    });

    it('keeps escaping rich-text values without a model', () => {
      const { html } = convertJsonToHtml({ json: doc({ body: '<p>Hi</p>' }) });
      expect(html).to.include('<div><p>&lt;p&gt;Hi&lt;/p&gt;</p></div>');
    });

    it('sanitizes rich-text values on write', () => {
      const { html } = save({
        json: doc({ body: '<p onclick="x()">a<script>alert(1)</script><a href="javascript:x">b</a><a href="\u00A0javascript:x">c</a></p>' }),
        schema,
      });
      expect(html).to.include('<div><p>abc</p></div>');
      expect(html).not.to.include('script');
    });

    it('converts plain-text values into paragraphs', () => {
      const { html } = save({ json: doc({ body: 'one\n\ntwo' }), schema });
      expect(html).to.include('<div><p>one</p><p>two</p></div>');
    });

    it('leaves out rich-text values without text content, like empty values', () => {
      const empty = '<p><br></p>';
      const { html } = save({
        json: doc({
          title: 't', body: empty, author: { bio: empty }, notes: [empty, '<p>n</p>'], grid: [[empty]],
        }),
        schema,
      });
      expect(html).not.to.include('<h3>body</h3>');
      expect(html).not.to.include('<h3>author</h3>');
      expect(html).not.to.include('<h3>grid</h3>');
      expect(convertHtmlToJson({ html }).json.data).to.deep.equal({ title: 't', notes: ['<p>n</p>'] });
    });

    it('writes rich-text array items as typed references', () => {
      const { html } = save({ json: doc({ notes: ['<p>n1</p>', 'n2'] }), schema });
      expect(html).to.include('<ul><li>self://rich-text#notes-1</li><li>self://rich-text#notes-2</li></ul>');
      expect(html).to.include('<div class="notes notes-1"><div><div><p>n1</p></div></div></div>');
      expect(html).to.include('<div class="notes notes-2"><div><div><p>n2</p></div></div></div>');
    });
  });

  describe('convertHtmlToJson', () => {
    it('reads written rich text as markup', () => {
      const json = doc({
        title: 'Title',
        body: '<p>Body <em>it</em></p><ul><li>a</li></ul>',
        author: { name: 'Ann', bio: '<p><u>Bio</u></p>' },
        sections: [{ heading: 'H1', content: '<p>First</p>' }],
        notes: ['<p>n1</p>', '<p><strong>n2</strong></p>'],
        grid: [['<p>a</p>', '<p>b</p>'], ['<p>c</p>']],
      });
      const { html } = save({ json, schema });
      expect(convertHtmlToJson({ html }).json).to.deep.equal(json);
    });

    it('sanitizes referenced rich-text blocks', () => {
      const html = `
        <main><div>
          <div class="da-form"><div><div><p>x-schema-name</p></div><div><p>article</p></div></div></div>
          <div class="article">
            <div><div><p>body</p></div><div><p>self://rich-text#body-1</p></div></div>
          </div>
          <div class="body body-1">
            <div>
              <div>
                <p onclick="x()">Hi <b>there</b><script>alert(1)</script></p>
                <a href="javascript:x">l</a><a href="&nbsp;javascript:x">m</a>
              </div>
            </div>
          </div>
        </div></main>`;
      expect(convertHtmlToJson({ html }).json.data.body).to.equal('<p>Hi <strong>there</strong></p><p>lm</p>');
    });

    it('leaves references of an unknown type as text', () => {
      const html = `
        <main><div>
          <div class="da-form"><div><div><p>x-schema-name</p></div><div><p>article</p></div></div></div>
          <div class="article"><div><div><p>body</p></div><div><p>self://video#body-1</p></div></div></div>
          <div class="body body-1"><div><div><p>Hi</p></div></div></div>
        </div></main>`;
      expect(convertHtmlToJson({ html }).json.data.body).to.equal('self://video#body-1');
    });

    it('keeps reading untyped references as objects', () => {
      const { html } = convertJsonToHtml({
        json: { metadata: { schemaName: 'article', extra: { gone: null } }, data: { author: { name: 'Ann' } } },
      });
      const { json } = convertHtmlToJson({ html });
      expect(json.data.author).to.deep.equal({ name: 'Ann' });
      expect(json.metadata.extra).to.deep.equal({});
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
          { heading: 'H2', content: '<ul><li><del>Second</del></li></ul>' },
        ],
        notes: ['<p>n1</p>', '<p><strong>n2</strong></p>'],
        grid: [['<p>a</p>', '<p>b</p>'], ['<p>c</p>']],
      });
      expect(roundtrip(json)).to.deep.equal(json);
    });

    it('preserves rich text under keys with spaces', () => {
      const spacedSchema = {
        type: 'object',
        properties: { 'My Body': RICH, 'Side notes': { type: 'array', items: RICH } },
      };
      const json = doc({ 'My Body': '<p>a</p>', 'Side notes': ['<p>b</p>'] });
      expect(roundtrip(json, spacedSchema)).to.deep.equal(json);
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
      const { json } = convertHtmlToJson({ html });
      const reloaded = createEngine({ schema, document: json });
      expect(reloaded.getState().document.data.body).to.equal('<p>Edited <strong>text</strong></p>');
    });
  });
});
