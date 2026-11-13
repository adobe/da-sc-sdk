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
import { executeServerCommand } from '@web/test-runner-commands';
import {
  TYPE_URLS, bundleSchema, createEngine, validateSchema,
} from '../../src/index.js';
import {
  GITHUB_TYPES_BASE, REGISTERED_TYPES, TYPES, registeredType,
} from '../../src/types/index.js';
import { latestByName } from '../../src/types/version.js';

const schema = {
  type: 'object',
  $defs: { Logo: { $ref: TYPES.image.url, title: 'Logo', required: ['altText'] } },
  properties: {
    title: { type: 'string' },
    hero: { $ref: TYPES.image.url, title: 'Hero' },
    logo: { $ref: '#/$defs/Logo' },
    gallery: { type: 'array', items: { $ref: TYPES.image.url } },
    datasheet: { $ref: TYPES.file.url, title: 'Datasheet' },
  },
};

describe('asset definitions', () => {
  [
    ['image', TYPES.image.schema, TYPES.image.url],
    ['file', TYPES.file.schema, TYPES.file.url],
  ].forEach(([name, definition, url]) => {
    it(`${name} is a frozen 2020-12 schema identified by its URL`, () => {
      expect(definition.$id).to.equal(url);
      expect(url).to.equal(`${GITHUB_TYPES_BASE}/${name}/v1.0.0.json`);
      expect(definition.$schema).to.equal('https://json-schema.org/draft/2020-12/schema');
      expect(Object.isFrozen(definition)).to.equal(true);
      expect(Object.isFrozen(definition.properties.src)).to.equal(true);
    });
  });

  it('registers every file in schemas/, identical to its definition', async () => {
    const files = await executeServerCommand('list-schemas');
    expect(REGISTERED_TYPES.map(({ name, version }) => `${name}/${version}.json`))
      .to.have.members(files);
    await Promise.all(REGISTERED_TYPES.map(async ({ name, version, schema: definition }) => {
      const resp = await fetch(new URL(`../../schemas/${name}/${version}.json`, import.meta.url));
      expect(definition, `${name}/${version}`).to.deep.equal(await resp.json());
    }));
  });

  it('defines an image as src and altText, requires src and allows nothing else', () => {
    expect(Object.keys(TYPES.image.schema.properties)).to.deep.equal(['src', 'altText']);
    expect(TYPES.image.schema.required).to.deep.equal(['src']);
    expect(TYPES.image.schema.additionalProperties).to.equal(false);
  });

  it('defines a file as src only, requires it and allows nothing else', () => {
    expect(Object.keys(TYPES.file.schema.properties)).to.deep.equal(['src']);
    expect(TYPES.file.schema.required).to.deep.equal(['src']);
    expect(TYPES.file.schema.additionalProperties).to.equal(false);
  });
});

describe('type registry', () => {
  it('lists every type by name, with the version from its file name', () => {
    expect(Object.keys(TYPES)).to.deep.equal(['image', 'file']);
    expect(TYPES.file).to.include({ name: 'file', version: 'v1.0.0' });
    expect(Object.isFrozen(TYPES.image)).to.equal(true);
  });

  it('exports the URL of the latest version of every type by name', () => {
    expect(TYPE_URLS).to.deep.equal({ image: TYPES.image.url, file: TYPES.file.url });
    expect(Object.isFrozen(TYPE_URLS)).to.equal(true);
  });

  it('lists every registered URL as a TypeUrl in index.d.ts', async () => {
    const typings = await (await fetch(new URL('../../index.d.ts', import.meta.url))).text();
    const union = typings.match(/export type TypeUrl =([^;]+);/)[1];
    const listed = [...union.matchAll(/`\$\{TypesBase\}\/([^`]+)`/g)]
      .map(([, path]) => `${GITHUB_TYPES_BASE}/${path}`);
    expect(listed).to.have.members(REGISTERED_TYPES.map(({ url }) => url));
    expect(typings).to.include(`type TypesBase = '${GITHUB_TYPES_BASE}';`);
  });

  it('lists the latest version of each type by name', () => {
    const type = (name, version) => ({ name, version });
    const latest = latestByName([
      type('image', 'v1.2.0'), type('image', 'v1.10.0'), type('image', 'v1.9.3'), type('file', 'v2.0.0'),
    ]);
    expect(latest.image.version).to.equal('v1.10.0');
    expect(latest.file.version).to.equal('v2.0.0');
  });

  it('lets a schema require the optional properties of a type', () => {
    expect(TYPES.image.requirableProperties).to.deep.equal(['altText']);
    expect(TYPES.file.requirableProperties).to.deep.equal([]);
  });

  it('finds the type of a URL, and no type for any other URL', () => {
    expect(registeredType(TYPES.image.url)).to.equal(TYPES.image);
    expect(registeredType('https://schemas.da.live/types/file/v1.0.0.json')).to.equal(undefined);
    expect(registeredType('https://example.com/image.json')).to.equal(undefined);
    expect(registeredType(undefined)).to.equal(undefined);
  });
});

describe('bundleSchema', () => {
  it('embeds each referenced asset definition under $defs with its $id', () => {
    const { schema: bundled } = bundleSchema({ schema });
    expect(bundled.$defs['da-image-v1.0.0']).to.deep.equal(TYPES.image.schema);
    expect(bundled.$defs['da-file-v1.0.0']).to.deep.equal(TYPES.file.schema);
    expect(bundled.$defs.Logo).to.deep.equal(schema.$defs.Logo);
    expect(bundled.properties).to.deep.equal(schema.properties);
  });

  it('does not modify the input or share structure with it', () => {
    const before = JSON.stringify(schema);
    const { schema: bundled } = bundleSchema({ schema });
    expect(JSON.stringify(schema)).to.equal(before);
    expect(bundled.properties).to.not.equal(schema.properties);
    expect(Object.isFrozen(bundled.$defs['da-image-v1.0.0'])).to.equal(false);
  });

  it('creates $defs with only the definitions the schema references', () => {
    const { schema: images } = bundleSchema({
      schema: { type: 'object', properties: { hero: { $ref: TYPES.image.url } } },
    });
    expect(Object.keys(images.$defs)).to.deep.equal(['da-image-v1.0.0']);
    const { schema: files } = bundleSchema({
      schema: { type: 'object', properties: { sheet: { $ref: TYPES.file.url } } },
    });
    expect(Object.keys(files.$defs)).to.deep.equal(['da-file-v1.0.0']);
  });

  it('picks a free key when the default one is taken', () => {
    const { schema: bundled } = bundleSchema({
      schema: { ...schema, $defs: { ...schema.$defs, 'da-image-v1.0.0': { type: 'string' } } },
    });
    expect(bundled.$defs['da-image-v1.0.0']).to.deep.equal({ type: 'string' });
    expect(bundled.$defs['da-image-v1.0.0-2'].$id).to.equal(TYPES.image.url);
  });

  it('replaces $defs that is not an object, so the definitions survive JSON', () => {
    [null, 'defs', []].forEach(($defs) => {
      const { schema: bundled } = bundleSchema({
        schema: { type: 'object', $defs, properties: { hero: { $ref: TYPES.image.url } } },
      });
      expect(JSON.parse(JSON.stringify(bundled)).$defs, JSON.stringify($defs))
        .to.deep.equal({ 'da-image-v1.0.0': TYPES.image.schema });
    });
  });

  it('finds references in $defs and array items, in first-use order', () => {
    const { schema: bundled } = bundleSchema({
      schema: {
        type: 'object',
        $defs: { Sheet: { $ref: TYPES.file.url } },
        properties: { gallery: { type: 'array', items: { $ref: TYPES.image.url } } },
      },
    });
    expect(Object.keys(bundled.$defs)).to.deep.equal(['Sheet', 'da-file-v1.0.0', 'da-image-v1.0.0']);
  });

  it('does not embed a definition again under another key', () => {
    const { schema: bundled } = bundleSchema({
      schema: { ...schema, $defs: { ...schema.$defs, Image: TYPES.image.schema } },
    });
    expect(Object.keys(bundled.$defs)).to.deep.equal(['Logo', 'Image', 'da-file-v1.0.0']);
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
