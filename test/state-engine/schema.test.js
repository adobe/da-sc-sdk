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
import { compileSchema } from '../../src/state-engine/schema.js';
import { TYPES } from '../../src/types/index.js';

describe('compileSchema', () => {
  describe('basic types', () => {
    it('compiles a simple object schema', () => {
      const { definition, editable } = compileSchema({
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          age: { type: 'integer' },
        },
      });

      expect(editable).to.equal(true);
      expect(definition.kind).to.equal('object');
      expect(definition.children).to.have.lengthOf(2);
      expect(definition.children[0]).to.include({ key: 'name', kind: 'string', label: 'Name' });
      expect(definition.children[1]).to.include({ key: 'age', kind: 'integer' });
    });

    it('marks fields listed in required', () => {
      const { definition } = compileSchema({
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
      });
      expect(definition.children.find((c) => c.key === 'name').required).to.equal(true);
      expect(definition.children.find((c) => c.key === 'age').required).to.equal(false);
    });

    it('compiles an array with an item schema', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: {
          tags: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
        },
      });
      const tags = definition.children[0];
      expect(tags.kind).to.equal('array');
      expect(tags.minItems).to.equal(1);
      expect(tags.maxItems).to.equal(5);
      expect(tags.item.kind).to.equal('string');
    });

    it('captures enumValues for a string with enum', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { color: { type: 'string', enum: ['red', 'green'] } },
      });
      const color = definition.children[0];
      expect(color.kind).to.equal('string');
      expect(color.enumValues).to.deep.equal(['red', 'green']);
    });

    it('captures semanticType for a string with x-semantic-type', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { body: { type: 'string', 'x-semantic-type': 'long-text' } },
      });
      const body = definition.children[0];
      expect(body.kind).to.equal('string');
      expect(body.semanticType).to.equal('long-text');
    });

    it('captures the rich-text semanticType on a string', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { body: { type: 'string', 'x-semantic-type': 'rich-text' } },
      });
      expect(definition.children[0].semanticType).to.equal('rich-text');
    });

    it('ignores rich-text on a non-string type', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { body: { type: 'array', items: { type: 'string' }, 'x-semantic-type': 'rich-text' } },
      });
      expect(definition.children[0].semanticType).to.equal(undefined);
    });

    it('compiles an image as an object with the SDK-defined src and altText fields, src required', () => {
      const { definition, issues } = compileSchema({
        type: 'object',
        required: ['hero'],
        properties: { hero: { $ref: TYPES.image.url, title: 'Hero' } },
      });
      const hero = definition.children[0];
      expect(issues).to.deep.equal([]);
      expect(hero).to.include({
        kind: 'object', typeRef: TYPES.image.url, typeName: 'image', label: 'Hero', required: true,
      });
      expect(hero.children.map(({ key, kind, label, required }) => ({
        key, kind, label, required,
      }))).to.deep.equal([
        { key: 'src', kind: 'string', label: 'Source', required: true },
        { key: 'altText', kind: 'string', label: 'Alt text', required: false },
      ]);
    });

    it('compiles a file as an object with only the SDK-defined src field', () => {
      const { definition, issues } = compileSchema({
        type: 'object',
        properties: { datasheet: { $ref: TYPES.file.url, title: 'Datasheet' } },
      });
      const datasheet = definition.children[0];
      expect(issues).to.deep.equal([]);
      expect(datasheet).to.include({
        kind: 'object', typeRef: TYPES.file.url, typeName: 'file', label: 'Datasheet',
      });
      expect(datasheet.children.map((c) => c.key)).to.deep.equal(['src']);
    });

    it('requires the alt text of an image when required lists it next to the $ref', () => {
      const { definition, issues } = compileSchema({
        type: 'object',
        properties: { hero: { $ref: TYPES.image.url, required: ['altText'] } },
      });
      expect(issues).to.deep.equal([]);
      expect(definition.children[0].children.map(({ key, required }) => ({ key, required })))
        .to.deep.equal([
          { key: 'src', required: true },
          { key: 'altText', required: true },
        ]);
    });

    it('requires the alt text through a $defs entry and at the local reference', () => {
      const { definition, issues } = compileSchema({
        type: 'object',
        $defs: {
          Logo: { $ref: TYPES.image.url, title: 'Logo', required: ['altText'] },
          Photo: { $ref: TYPES.image.url },
        },
        properties: {
          logo: { $ref: '#/$defs/Logo' },
          photo: { $ref: '#/$defs/Photo', required: ['altText'] },
          gallery: { type: 'array', items: { $ref: TYPES.image.url, required: ['altText'] } },
        },
      });
      expect(issues).to.deep.equal([]);
      const altRequired = (node) => node.children.find((c) => c.key === 'altText').required;
      const [logo, photo, gallery] = definition.children;
      expect(altRequired(logo)).to.equal(true);
      expect(altRequired(photo)).to.equal(true);
      expect(altRequired(gallery.item)).to.equal(true);
    });

    it('keeps annotations next to an asset reference', () => {
      const { definition, issues } = compileSchema({
        type: 'object',
        properties: {
          hero: {
            $ref: TYPES.image.url,
            title: 'Hero',
            description: 'The main image',
            readOnly: true,
            default: null,
            $comment: 'note',
            examples: [],
            'x-hint': 1,
          },
        },
      });
      const hero = definition.children[0];
      expect(issues).to.deep.equal([]);
      expect(hero).to.include({
        kind: 'object', typeRef: TYPES.image.url, label: 'Hero', description: 'The main image', readonly: true,
      });
      expect(hero.children.map((c) => c.key)).to.deep.equal(['src', 'altText']);
    });

    it('reports keywords next to an image reference that would change the image', () => {
      const { definition, issues } = compileSchema({
        type: 'object',
        properties: {
          hero: {
            $ref: TYPES.image.url,
            title: 'Hero',
            type: 'object',
            properties: { caption: { type: 'string' } },
          },
        },
      });
      expect(issues).to.deep.equal([{
        reason: 'type-ref-keywords',
        message: 'Only these keywords can be set next to the image reference (title, description, readOnly, default, required: ["altText"]). Remove "type", "properties".',
        schemaPath: '/properties/hero',
        pointer: '/data/hero',
        details: { ref: TYPES.image.url, properties: ['type', 'properties'] },
      }]);
      expect(definition.children[0]).to.include({ kind: 'unsupported', readonly: true });
    });

    it('reports a required next to an image that lists anything but altText once', () => {
      [['src'], ['altText', 'src'], ['altText', 'altText'], [], 'altText'].forEach((required) => {
        const { issues } = compileSchema({
          type: 'object',
          properties: { hero: { $ref: TYPES.image.url, required } },
        });
        expect(issues.map((i) => [i.reason, i.details.properties])).to.deep.equal([
          ['type-ref-keywords', ['required']],
        ]);
      });
    });

    it('reports any keyword but annotations next to a file reference', () => {
      const { issues } = compileSchema({
        type: 'object',
        properties: { datasheet: { $ref: TYPES.file.url, required: ['altText'], type: 'object' } },
      });
      expect(issues).to.deep.equal([{
        reason: 'type-ref-keywords',
        message: 'Only these keywords can be set next to the file reference (title, description, readOnly, default). Remove "required", "type".',
        schemaPath: '/properties/datasheet',
        pointer: '/data/datasheet',
        details: { ref: TYPES.file.url, properties: ['required', 'type'] },
      }]);
    });

    it('reports keywords next to an asset reference inside $defs and array items', () => {
      const { issues } = compileSchema({
        type: 'object',
        $defs: { Logo: { $ref: TYPES.image.url, required: ['src'] } },
        properties: {
          logo: { $ref: '#/$defs/Logo' },
          gallery: { type: 'array', items: { $ref: TYPES.image.url, additionalProperties: true } },
        },
      });
      expect(issues.map(({ reason, schemaPath, pointer, details }) => ({
        reason, schemaPath, pointer, properties: details.properties,
      }))).to.deep.equal([
        {
          reason: 'type-ref-keywords', schemaPath: '/$defs/Logo', pointer: '/data/logo', properties: ['required'],
        },
        {
          reason: 'type-ref-keywords', schemaPath: '/properties/gallery/items', pointer: '/data/gallery/0', properties: ['additionalProperties'],
        },
      ]);
    });

    it('reports keywords next to a local reference to an asset', () => {
      const { issues } = compileSchema({
        type: 'object',
        $defs: { Datasheet: { $ref: TYPES.file.url, title: 'Datasheet' } },
        properties: { sheet: { $ref: '#/$defs/Datasheet', title: 'Sheet', required: ['altText'] } },
      });
      const summary = issues.map(({ reason, schemaPath, details }) => ({
        reason, schemaPath, details,
      }));
      expect(summary).to.deep.equal([{
        reason: 'type-ref-keywords',
        schemaPath: '/properties/sheet',
        details: { ref: TYPES.file.url, properties: ['required'] },
      }]);
    });

    it('labels an untitled asset with its key, not the definition title', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { hero: { $ref: TYPES.image.url } },
      });
      expect(definition.children[0].label).to.equal('hero');
    });

    it('compiles an asset reached through a local $defs reference', () => {
      const { definition, issues } = compileSchema({
        type: 'object',
        $defs: { Logo: { $ref: TYPES.image.url, title: 'Logo' } },
        properties: { logo: { $ref: '#/$defs/Logo' } },
      });
      expect(issues).to.deep.equal([]);
      expect(definition.children[0]).to.include({ typeRef: TYPES.image.url, label: 'Logo' });
    });

    it('compiles an array of assets', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: {
          gallery: { type: 'array', items: { $ref: TYPES.image.url } },
          files: { type: 'array', items: { $ref: TYPES.file.url } },
        },
      });
      const [gallery, files] = definition.children;
      expect(gallery.item).to.include({ kind: 'object', typeRef: TYPES.image.url });
      expect(gallery.item.children.map((c) => c.key)).to.deep.equal(['src', 'altText']);
      expect(files.item).to.include({ kind: 'object', typeRef: TYPES.file.url });
      expect(files.item.children.map((c) => c.key)).to.deep.equal(['src']);
    });

    it('reports external references other than the asset definitions', () => {
      const { issues } = compileSchema({
        type: 'object',
        properties: { hero: { $ref: 'https://example.com/schemas/image.json' } },
      });
      expect(issues.map((i) => i.reason)).to.deep.equal(['external-ref']);
      expect(issues[0].message).to.include(TYPES.image.url).and.include(TYPES.file.url);
    });

    it('lets enum win over x-semantic-type', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { color: { type: 'string', enum: ['red'], 'x-semantic-type': 'long-text' } },
      });
      const color = definition.children[0];
      expect(color.enumValues).to.deep.equal(['red']);
      expect(color.semanticType).to.equal(undefined);
    });

    it('ignores x-semantic-type on a non-string type', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { count: { type: 'number', 'x-semantic-type': 'long-text' } },
      });
      expect(definition.children[0].semanticType).to.equal(undefined);
    });

    it('drops an unrecognized x-semantic-type value', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { swatch: { type: 'string', 'x-semantic-type': 'color' } },
      });
      const swatch = definition.children[0];
      expect(swatch.kind).to.equal('string');
      expect(swatch.semanticType).to.equal(undefined);
    });

    ['date', 'date-time', 'time'].forEach((format) => {
      it(`captures format "${format}" on a string`, () => {
        const { definition } = compileSchema({
          type: 'object',
          properties: { when: { type: 'string', format } },
        });
        const when = definition.children[0];
        expect(when.kind).to.equal('string');
        expect(when.format).to.equal(format);
      });
    });

    it('lets enum win over format', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { when: { type: 'string', enum: ['2026-08-14'], format: 'date' } },
      });
      const when = definition.children[0];
      expect(when.enumValues).to.deep.equal(['2026-08-14']);
      expect(when.format).to.equal(undefined);
    });

    it('lets format win over x-semantic-type', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { when: { type: 'string', format: 'date', 'x-semantic-type': 'long-text' } },
      });
      const when = definition.children[0];
      expect(when.format).to.equal('date');
      expect(when.semanticType).to.equal(undefined);
    });

    it('drops an unsupported format value', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { email: { type: 'string', format: 'email' } },
      });
      expect(definition.children[0].format).to.equal(undefined);
    });

    it('ignores format on a non-string type', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { count: { type: 'number', format: 'date' } },
      });
      expect(definition.children[0].format).to.equal(undefined);
    });

    it('marks a property without an explicit type as unsupported', () => {
      const { definition, editable } = compileSchema({
        type: 'object',
        properties: { mystery: { enum: ['red', 'green'] } },
      });
      expect(definition.children[0].kind).to.equal('unsupported');
      expect(definition.children[0].unsupported.reason).to.equal('missing-type');
      expect(editable).to.equal(false);
    });

    it('marks a property with an unsupported type value as unsupported', () => {
      const { definition, editable } = compileSchema({
        type: 'object',
        properties: { x: { type: 'weird' } },
      });
      expect(definition.children[0].kind).to.equal('unsupported');
      expect(definition.children[0].unsupported.reason).to.equal('unsupported-type');
      expect(definition.children[0].unsupported.feature).to.equal('weird');
      expect(editable).to.equal(false);
    });

    it('marks a property whose type is an array as unsupported', () => {
      const { definition, editable } = compileSchema({
        type: 'object',
        properties: { x: { type: ['string', 'null'] } },
      });
      expect(definition.children[0].kind).to.equal('unsupported');
      expect(definition.children[0].unsupported.reason).to.equal('type-as-array');
      expect(editable).to.equal(false);
    });

    it('honours readOnly', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { id: { type: 'string', readOnly: true } },
      });
      expect(definition.children[0].readonly).to.equal(true);
    });

    it('picks up default values', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { name: { type: 'string', default: 'Untitled' } },
      });
      expect(definition.children[0].defaultValue).to.equal('Untitled');
    });

    it('carries description onto the node', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { slug: { type: 'string', description: 'Lowercase, hyphen-separated.' } },
      });
      expect(definition.children[0].description).to.equal('Lowercase, hyphen-separated.');
    });
  });

  describe('$ref', () => {
    it('resolves an internal $ref', () => {
      const { definition, editable } = compileSchema({
        type: 'object',
        $defs: {
          Address: {
            type: 'object',
            properties: { street: { type: 'string' } },
          },
        },
        properties: {
          home: { $ref: '#/$defs/Address' },
        },
      });
      expect(editable).to.equal(true);
      const home = definition.children[0];
      expect(home.kind).to.equal('object');
      expect(home.children[0].key).to.equal('street');
    });

    it('terminates on cyclic refs without throwing', () => {
      const { definition } = compileSchema({
        type: 'object',
        $defs: {
          Node: {
            type: 'object',
            properties: { next: { $ref: '#/$defs/Node' } },
          },
        },
        properties: { head: { $ref: '#/$defs/Node' } },
      });
      // The second-level dereference is broken intentionally; we just want no infinite loop.
      expect(definition).to.exist;
      expect(definition.kind).to.equal('object');
    });

    it('marks an external $ref as unsupported', () => {
      const { definition, editable, issues } = compileSchema({
        type: 'object',
        properties: {
          remote: { $ref: 'https://example.com/schema.json' },
        },
      });
      const remote = definition.children[0];
      expect(remote.kind).to.equal('unsupported');
      expect(remote.unsupported.reason).to.equal('external-ref');
      expect(remote.unsupported.details.ref).to.equal('https://example.com/schema.json');
      expect(editable).to.equal(false);
      expect(issues.some((i) => i.reason === 'external-ref')).to.equal(true);
    });

    it('marks a $ref that does not resolve as unsupported', () => {
      const { definition, editable, issues } = compileSchema({
        type: 'object',
        properties: {
          ghost: { $ref: '#/$defs/Missing' },
        },
      });
      const ghost = definition.children[0];
      expect(ghost.kind).to.equal('unsupported');
      expect(ghost.unsupported.reason).to.equal('unresolved-ref');
      expect(ghost.unsupported.details.ref).to.equal('#/$defs/Missing');
      expect(editable).to.equal(false);
      expect(issues.some((i) => i.reason === 'unresolved-ref')).to.equal(true);
    });
  });

  describe('compositions', () => {
    it('marks a single-entry allOf as unsupported (no composition is allowed)', () => {
      const { definition, editable, issues } = compileSchema({
        type: 'object',
        properties: {
          x: { allOf: [{ type: 'string', minLength: 3 }] },
        },
      });
      expect(editable).to.equal(false);
      expect(definition.children[0].kind).to.equal('unsupported');
      expect(issues.some((i) => i.details?.keyword === 'allOf')).to.equal(true);
    });

    it('marks a property with oneOf as unsupported; root definition still exists and editable is false', () => {
      const { definition, editable, issues } = compileSchema({
        type: 'object',
        properties: {
          x: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        },
      });
      expect(editable).to.equal(false);
      expect(issues.some((i) => i.details?.keyword === 'oneOf')).to.equal(true);
      expect(definition).to.exist;
      expect(definition.kind).to.equal('object');
      expect(definition.children[0].kind).to.equal('unsupported');
    });

    it('marks anyOf as unsupported', () => {
      const { editable, issues } = compileSchema({
        type: 'object',
        properties: { x: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
      });
      expect(editable).to.equal(false);
      expect(issues.some((i) => i.details?.keyword === 'anyOf')).to.equal(true);
    });

    it('marks multi-entry allOf as unsupported', () => {
      const { editable, issues } = compileSchema({
        type: 'object',
        properties: { x: { allOf: [{ type: 'string' }, { minLength: 3 }] } },
      });
      expect(editable).to.equal(false);
      expect(issues.some((i) => i.details?.keyword === 'allOf')).to.equal(true);
    });
  });

  describe('empty / unsupported root', () => {
    it('returns null definition for null schema', () => {
      const result = compileSchema(null);
      expect(result.definition).to.equal(null);
      expect(result.editable).to.equal(false);
    });

    it('returns an unsupported-kind definition when the root uses only unsupported composition (no properties)', () => {
      const result = compileSchema({ oneOf: [{ type: 'string' }, { type: 'number' }] });
      expect(result.definition).to.exist;
      expect(result.definition.kind).to.equal('unsupported');
      expect(result.editable).to.equal(false);
    });

    it('compiles root as object with unsupportedComposition when allOf is present alongside properties', () => {
      const result = compileSchema({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
        allOf: [
          { required: ['name'] },
          { properties: { name: { minLength: 2 } } },
        ],
      });
      expect(result.definition.kind).to.equal('object');
      expect(result.definition.unsupportedComposition).to.deep.include({ compositionKeyword: 'allOf' });
      expect(result.definition.children).to.have.lengthOf(2);
      expect(result.editable).to.equal(false);
      expect(result.issues.some((i) => i.details?.keyword === 'allOf')).to.equal(true);
    });

    it('compiles a sub-property as object with unsupportedComposition when anyOf + properties co-exist', () => {
      const result = compileSchema({
        type: 'object',
        properties: {
          audience: {
            type: 'object',
            properties: {
              segments: { type: 'array', items: { type: 'string' } },
              regions: { type: 'array', items: { type: 'string' } },
            },
            anyOf: [{ required: ['segments'] }, { required: ['regions'] }],
          },
        },
      });
      expect(result.definition.kind).to.equal('object');
      const audience = result.definition.children[0];
      expect(audience.kind).to.equal('object');
      expect(audience.unsupportedComposition).to.deep.include({ compositionKeyword: 'anyOf' });
      expect(audience.children).to.have.lengthOf(2);
      expect(result.editable).to.equal(false);
    });

    it('marks a property as fully unsupported when oneOf has no direct properties', () => {
      const result = compileSchema({
        type: 'object',
        properties: {
          channel: {
            oneOf: [
              { type: 'object', properties: { email: { type: 'string' } } },
              { type: 'object', properties: { social: { type: 'string' } } },
            ],
          },
        },
      });
      const channel = result.definition.children[0];
      expect(channel.kind).to.equal('unsupported');
      expect(channel.unsupported.compositionKeyword).to.equal('oneOf');
    });
  });
});
