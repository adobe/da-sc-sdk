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
import {
  FILE_SCHEMA, FILE_SCHEMA_URL, IMAGE_SCHEMA, IMAGE_SCHEMA_URL,
  bundleSchema, createEngine, validateSchema,
} from '../../src/index.js';

const schema = {
  type: 'object',
  $defs: { Logo: { $ref: IMAGE_SCHEMA_URL, title: 'Logo', required: ['altText'] } },
  properties: {
    title: { type: 'string' },
    hero: { $ref: IMAGE_SCHEMA_URL, title: 'Hero' },
    logo: { $ref: '#/$defs/Logo' },
    gallery: { type: 'array', items: { $ref: IMAGE_SCHEMA_URL } },
    datasheet: { $ref: FILE_SCHEMA_URL, title: 'Datasheet' },
  },
};

describe('asset definitions', () => {
  [
    ['image', IMAGE_SCHEMA, IMAGE_SCHEMA_URL],
    ['file', FILE_SCHEMA, FILE_SCHEMA_URL],
  ].forEach(([name, definition, url]) => {
    it(`${name} is a frozen 2020-12 schema identified by its URL`, () => {
      expect(definition.$id).to.equal(url);
      expect(url).to.match(new RegExp(`/schemas/${name}/v1\\.json$`));
      expect(definition.$schema).to.equal('https://json-schema.org/draft/2020-12/schema');
      expect(Object.isFrozen(definition)).to.equal(true);
      expect(Object.isFrozen(definition.properties.src)).to.equal(true);
    });

    it(`${name} matches the committed schemas/${name}/v1.json (run the build when it drifts)`, async () => {
      const res = await fetch(new URL(`../../schemas/${name}/v1.json`, import.meta.url));
      expect(res.ok).to.equal(true);
      expect(await res.text()).to.equal(`${JSON.stringify(definition, null, 2)}\n`);
    });
  });

  it('defines an image as src and altText, requires src and allows nothing else', () => {
    expect(Object.keys(IMAGE_SCHEMA.properties)).to.deep.equal(['src', 'altText']);
    expect(IMAGE_SCHEMA.required).to.deep.equal(['src']);
    expect(IMAGE_SCHEMA.additionalProperties).to.equal(false);
  });

  it('defines a file as src only, requires it and allows nothing else', () => {
    expect(Object.keys(FILE_SCHEMA.properties)).to.deep.equal(['src']);
    expect(FILE_SCHEMA.required).to.deep.equal(['src']);
    expect(FILE_SCHEMA.additionalProperties).to.equal(false);
  });
});

describe('bundleSchema', () => {
  it('embeds each referenced asset definition under $defs with its $id', () => {
    const { schema: bundled } = bundleSchema({ schema });
    expect(bundled.$defs['da-image-v1']).to.deep.equal(IMAGE_SCHEMA);
    expect(bundled.$defs['da-file-v1']).to.deep.equal(FILE_SCHEMA);
    expect(bundled.$defs.Logo).to.deep.equal(schema.$defs.Logo);
    expect(bundled.properties).to.deep.equal(schema.properties);
  });

  it('does not modify the input or share structure with it', () => {
    const before = JSON.stringify(schema);
    const { schema: bundled } = bundleSchema({ schema });
    expect(JSON.stringify(schema)).to.equal(before);
    expect(bundled.properties).to.not.equal(schema.properties);
    expect(Object.isFrozen(bundled.$defs['da-image-v1'])).to.equal(false);
  });

  it('creates $defs with only the definitions the schema references', () => {
    const { schema: images } = bundleSchema({
      schema: { type: 'object', properties: { hero: { $ref: IMAGE_SCHEMA_URL } } },
    });
    expect(Object.keys(images.$defs)).to.deep.equal(['da-image-v1']);
    const { schema: files } = bundleSchema({
      schema: { type: 'object', properties: { sheet: { $ref: FILE_SCHEMA_URL } } },
    });
    expect(Object.keys(files.$defs)).to.deep.equal(['da-file-v1']);
  });

  it('picks a free key when the default one is taken', () => {
    const { schema: bundled } = bundleSchema({
      schema: { ...schema, $defs: { ...schema.$defs, 'da-image-v1': { type: 'string' } } },
    });
    expect(bundled.$defs['da-image-v1']).to.deep.equal({ type: 'string' });
    expect(bundled.$defs['da-image-v1-2'].$id).to.equal(IMAGE_SCHEMA_URL);
  });

  it('replaces $defs that is not an object, so the definitions survive JSON', () => {
    [null, 'defs', []].forEach(($defs) => {
      const { schema: bundled } = bundleSchema({
        schema: { type: 'object', $defs, properties: { hero: { $ref: IMAGE_SCHEMA_URL } } },
      });
      expect(JSON.parse(JSON.stringify(bundled)).$defs, JSON.stringify($defs))
        .to.deep.equal({ 'da-image-v1': IMAGE_SCHEMA });
    });
  });

  it('finds references in $defs and array items, in first-use order', () => {
    const { schema: bundled } = bundleSchema({
      schema: {
        type: 'object',
        $defs: { Sheet: { $ref: FILE_SCHEMA_URL } },
        properties: { gallery: { type: 'array', items: { $ref: IMAGE_SCHEMA_URL } } },
      },
    });
    expect(Object.keys(bundled.$defs)).to.deep.equal(['Sheet', 'da-file-v1', 'da-image-v1']);
  });

  it('does not embed a definition again under another key', () => {
    const { schema: bundled } = bundleSchema({
      schema: { ...schema, $defs: { ...schema.$defs, Image: IMAGE_SCHEMA } },
    });
    expect(Object.keys(bundled.$defs)).to.deep.equal(['Logo', 'Image', 'da-file-v1']);
  });

  it('is idempotent', () => {
    const once = bundleSchema({ schema }).schema;
    const twice = bundleSchema({ schema: once }).schema;
    expect(twice).to.deep.equal(once);
  });

  it('returns a copy unchanged when the schema has no asset', () => {
    const plain = { type: 'object', properties: { title: { type: 'string' } } };
    const { schema: bundled } = bundleSchema({ schema: plain });
    expect(bundled).to.deep.equal(plain);
    expect(bundled).to.not.equal(plain);
  });

  it('rejects a schema that is not an object', () => {
    [null, undefined, 'schema', []].forEach((value) => {
      expect(bundleSchema({ schema: value })).to.have.property('error');
    });
    expect(bundleSchema()).to.have.property('error');
  });

  it('compiles the same in the SDK before and after bundling', () => {
    const { schema: bundled } = bundleSchema({ schema });
    expect(validateSchema({ schema: bundled })).to.deep.equal({ valid: true, schemaIssues: [] });
    const model = (s) => createEngine({ schema: s, document: { data: {} } }).getState().model;
    expect(model(bundled)).to.deep.equal(model(schema));
  });
});
