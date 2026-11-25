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
import { validateData } from '../../src/state-engine/index.js';
import file from '../../src/types/shared/file/1.0.0.js';
import image from '../../src/types/shared/image/1.0.0.js';

describe('validateData', () => {
  it('returns valid=true and an empty errors map for a clean document', () => {
    const result = validateData({
      schema: { type: 'object', properties: { name: { type: 'string', title: 'Name' } } },
      data: { name: 'Alice' },
    });
    expect(result.valid).to.equal(true);
    expect(result.errors).to.deep.equal({});
    expect(result.schemaIssues).to.deep.equal([]);
  });

  it('returns valid=false when data has errors', () => {
    const result = validateData({
      schema: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', title: 'Name' } },
      },
      data: {},
    });
    expect(result.valid).to.equal(false);
    expect(Object.keys(result.errors)).to.have.lengthOf.at.least(1);
  });

  it('returns valid=false when the schema itself has issues', () => {
    const result = validateData({
      schema: {
        type: 'object',
        properties: { choice: { oneOf: [{ type: 'string' }, { type: 'number' }] } },
      },
      data: {},
    });
    expect(result.valid).to.equal(false);
    expect(result.schemaIssues.length).to.be.greaterThan(0);
  });

  it('flags missing required fields at the child pointer with missingProperty', () => {
    const result = validateData({
      schema: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', title: 'Name' } },
      },
      data: { name: '' },
    });
    expect(result.errors['/data/name']).to.deep.equal({
      keyword: 'required',
      instancePath: '/data/name',
      params: { missingProperty: 'name' },
      message: 'This field is required.',
    });
  });

  it('flags a constraint violation', () => {
    const result = validateData({
      schema: {
        type: 'object',
        properties: { name: { type: 'string', title: 'Name', minLength: 3 } },
      },
      data: { name: 'ab' },
    });
    expect(result.errors['/data/name']).to.deep.equal({
      keyword: 'minLength',
      instancePath: '/data/name',
      params: { limit: 3 },
      message: 'Must be at least 3 characters.',
    });
  });

  it('classifies schemaIssues by reason', () => {
    const result = validateData({
      schema: {
        type: 'object',
        properties: {
          choice: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        },
      },
      data: {},
    });
    expect(result.schemaIssues.some((i) => i.reason === 'unsupported-composition')).to.equal(true);
  });

  it('returns valid=false with empty errors / schemaIssues for a null schema', () => {
    const result = validateData({ schema: null, data: {} });
    expect(result.valid).to.equal(false);
    expect(result.errors).to.deep.equal({});
    expect(result.schemaIssues).to.deep.equal([]);
  });

  it('treats undefined data as an empty document', () => {
    const result = validateData({
      schema: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', title: 'Name' } },
      },
    });
    expect(result.errors['/data/name']?.keyword).to.equal('required');
    expect(result.errors['/data/name']?.params?.missingProperty).to.equal('name');
  });

  it('accepts an array-root schema with an array data payload', () => {
    const result = validateData({
      schema: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            matrix: {
              type: 'array',
              items: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      data: [
        { name: 'alpha', matrix: [['a1', 'a2']] },
        { name: 'beta', matrix: [['b1']] },
      ],
    });
    expect(result.errors).to.deep.equal({});
    expect(result.schemaIssues).to.deep.equal([]);
  });

  it('flags a required-field violation inside an array-root item', () => {
    // `note` gives the row content so it survives pruning; a row of only blank
    // leaves would be treated as absent and left unvalidated.
    const result = validateData({
      schema: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string' }, note: { type: 'string' } },
        },
      },
      data: [{ name: '', note: 'kept' }],
    });
    expect(result.errors['/data/0/name']?.keyword).to.equal('required');
    expect(result.errors['/data/0/name']?.params?.missingProperty).to.equal('name');
  });

  it('never leaks a schema location into data errors', () => {
    const result = validateData({
      schema: { type: 'object', properties: { name: { type: 'string', minLength: 3 } } },
      data: { name: 'a' },
    });
    // Data errors describe the data for the person filling it in — they must
    // not expose schema structure. schemaPath lives on schemaIssues only.
    for (const error of Object.values(result.errors)) {
      expect(error).to.not.have.property('schemaPath');
    }
  });
  describe('shared schema values', () => {
    const schema = {
      type: 'object',
      required: ['hero'],
      properties: {
        hero: { $ref: image.$id, title: 'Hero' },
        gallery: { type: 'array', items: { $ref: image.$id } },
      },
    };

    it('accepts a shared schema value with a source', () => {
      const result = validateData({ schema, data: { hero: { src: './media_ab12.jpg' } } });
      expect(result.errors).to.deep.equal({});
      expect(result.valid).to.equal(true);
    });

    it('flags a missing required shared schema value as a field', () => {
      const result = validateData({ schema, data: { hero: { src: '', alt: '' } } });
      expect(result.errors).to.deep.equal({
        '/data/hero': {
          keyword: 'required',
          instancePath: '/data/hero',
          params: { missingProperty: 'hero' },
          message: 'This field is required.',
        },
      });
    });

    it('flags alt text without a source on the source', () => {
      const result = validateData({
        schema,
        data: { hero: { src: './media_ab12.jpg' }, gallery: [{ alt: 'No image' }] },
      });
      expect(result.errors).to.deep.equal({
        '/data/gallery/0/src': {
          keyword: 'required',
          instancePath: '/data/gallery/0/src',
          params: { missingProperty: 'src' },
          message: 'This field is required.',
        },
      });
    });

    it('flags alt text without a source on a required shared schema value once', () => {
      const result = validateData({ schema, data: { hero: { alt: 'No image' } } });
      expect(Object.keys(result.errors)).to.deep.equal(['/data/hero/src']);
    });

    describe('with required alt text', () => {
      const altSchema = {
        type: 'object',
        properties: {
          hero: { $ref: image.$id, required: ['alt'] },
          datasheet: { $ref: file.$id },
        },
      };

      it('flags an image without alt text on the alt text', () => {
        const result = validateData({ schema: altSchema, data: { hero: { src: './media_ab12.jpg' } } });
        expect(result.errors).to.deep.equal({
          '/data/hero/alt': {
            keyword: 'required',
            instancePath: '/data/hero/alt',
            params: { missingProperty: 'alt' },
            message: 'This field is required.',
          },
        });
      });

      it('accepts an image with alt text, an absent image and a file without alt text', () => {
        [
          { hero: { src: './media_ab12.jpg', alt: 'A hero' } },
          {},
          { hero: { src: '', alt: '' } },
          { datasheet: { src: './media_ab12.pdf' } },
        ].forEach((data) => {
          expect(validateData({ schema: altSchema, data }).errors).to.deep.equal({});
        });
      });

      it('treats whitespace-only alt text without a source as no image', () => {
        const result = validateData({ schema: altSchema, data: { hero: { alt: ' ' } } });
        expect(result.errors).to.deep.equal({});
      });

      it('flags whitespace-only alt text when the image has a source', () => {
        const result = validateData({
          schema: altSchema, data: { hero: { src: './media_ab12.jpg', alt: '  ' } },
        });
        expect(Object.keys(result.errors)).to.deep.equal(['/data/hero/alt']);
      });

      it('requires alt text in array items and nested objects', () => {
        const result = validateData({
          schema: {
            type: 'object',
            properties: {
              gallery: { type: 'array', items: { $ref: image.$id, required: ['alt'] } },
              card: {
                type: 'object',
                properties: { image: { $ref: image.$id, required: ['alt'] } },
              },
            },
          },
          data: {
            gallery: [{ src: './media_ab12.jpg', alt: 'One' }, { src: './media_cd34.jpg' }],
            card: { image: { src: './media_ab12.jpg' } },
          },
        });
        expect(Object.keys(result.errors)).to.deep.equal([
          '/data/gallery/1/alt',
          '/data/card/image/alt',
        ]);
      });
    });

    it('flags a source and alt text that are not strings', () => {
      const result = validateData({ schema, data: { hero: { src: 42, alt: true } } });
      const keywords = Object.entries(result.errors)
        .map(([pointer, error]) => [pointer, error.keyword]);
      expect(Object.fromEntries(keywords))
        .to.deep.equal({ '/data/hero/src': 'type', '/data/hero/alt': 'type' });
    });

    it('flags a shared schema value given as a string or array on its source', () => {
      ['./media_ab12.jpg', ['./media_ab12.jpg']].forEach((hero) => {
        const result = validateData({ schema, data: { hero } });
        expect(Object.keys(result.errors), JSON.stringify(hero)).to.deep.equal(['/data/hero/src']);
      });
    });

    it('flags each property a shared schema does not allow, at its pointer', () => {
      const result = validateData({
        schema: {
          type: 'object',
          $defs: { Datasheet: { $ref: file.$id } },
          properties: {
            hero: { $ref: image.$id },
            gallery: { type: 'array', items: { $ref: image.$id } },
            sheet: { $ref: '#/$defs/Datasheet' },
          },
        },
        data: {
          hero: { src: './media_ab12.jpg', extra: 'x', 'a/b': 1 },
          gallery: [{ src: './media_cd34.jpg', caption: 'One' }],
          sheet: { src: './media_ef56.pdf', alt: 'A sheet' },
        },
      });
      expect(result.valid).to.equal(false);
      expect(result.errors).to.deep.equal({
        '/data/hero/extra': {
          keyword: 'additionalProperties',
          instancePath: '/data/hero/extra',
          params: { additionalProperty: 'extra' },
          message: 'This property is not allowed.',
        },
        '/data/hero/a~1b': {
          keyword: 'additionalProperties',
          instancePath: '/data/hero/a~1b',
          params: { additionalProperty: 'a/b' },
          message: 'This property is not allowed.',
        },
        '/data/gallery/0/caption': {
          keyword: 'additionalProperties',
          instancePath: '/data/gallery/0/caption',
          params: { additionalProperty: 'caption' },
          message: 'This property is not allowed.',
        },
        '/data/sheet/alt': {
          keyword: 'additionalProperties',
          instancePath: '/data/sheet/alt',
          params: { additionalProperty: 'alt' },
          message: 'This property is not allowed.',
        },
      });
    });

    it('lets an empty other property of a shared schema value pass, as saving removes it', () => {
      ['', null, [], {}, { a: '' }].forEach((extra) => {
        const result = validateData({ schema, data: { hero: { src: './media_ab12.jpg', extra } } });
        expect(result.errors, JSON.stringify(extra)).to.deep.equal({});
      });
    });

    it('keeps allowing other properties on objects of the customer schema', () => {
      const result = validateData({
        schema: { type: 'object', properties: { card: { type: 'object', properties: {} } } },
        data: { card: { extra: 'x' }, other: 'y' },
      });
      expect(result.errors).to.deep.equal({});
    });

    it('flags a missing required file and a file without a source', () => {
      const fileSchema = {
        type: 'object',
        required: ['datasheet'],
        properties: { datasheet: { $ref: file.$id } },
      };
      expect(Object.keys(validateData({ schema: fileSchema, data: {} }).errors))
        .to.deep.equal(['/data/datasheet']);
      expect(validateData({ schema: fileSchema, data: { datasheet: { src: './media_ab12.pdf' } } }).valid)
        .to.equal(true);
    });
  });
});
