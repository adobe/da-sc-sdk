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
  ORIGIN, SHARED_SCHEMAS, findSharedSchemaById, findSharedSchemaByPath, registerSharedSchemas,
  parseSharedSchemaName,
} from '../../src/types/index.js';

function expectDeepFrozen(value, at) {
  expect(Object.isFrozen(value), at).to.equal(true);
  Object.entries(value)
    .filter(([, child]) => child && typeof child === 'object')
    .forEach(([key, child]) => expectDeepFrozen(child, `${at}/${key}`));
}

describe('shared schemas', () => {
  it('declares JSON Schema 2020-12 and freezes every object', () => {
    expect(Object.isFrozen(SHARED_SCHEMAS)).to.equal(true);
    SHARED_SCHEMAS.forEach((schema) => {
      expect(schema.$schema).to.equal('https://json-schema.org/draft/2020-12/schema');
      expectDeepFrozen(schema, schema.$id);
    });
  });

  it('defines an image as src and alt, requires src and allows nothing else', () => {
    const image = findSharedSchemaByPath('/schemas/shared/image/v1.0.0.json');
    expect(Object.keys(image.properties)).to.deep.equal(['src', 'alt']);
    expect(image.required).to.deep.equal(['src']);
    expect(image.additionalProperties).to.equal(false);
  });

  it('defines a file as src only, requires it and allows nothing else', () => {
    const file = findSharedSchemaByPath('/schemas/shared/file/v1.0.0.json');
    expect(Object.keys(file.properties)).to.deep.equal(['src']);
    expect(file.required).to.deep.equal(['src']);
    expect(file.additionalProperties).to.equal(false);
  });

  it('accepts only a media bus path or an http(s) URL as src', () => {
    const valid = [
      './media_1a2b3c.png',
      'media_1a2b3c.jpg?width=750#top',
      ' ./media_ab12.jpg?width=750&format=jpg ',
      'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/hero.jpg',
      'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/as/hero.avif?width=2000',
      'https://www.example.com/adobe/assets/urn:aaid:aem:1/as/hero.avif',
      'http://localhost:3000/hero.jpg',
    ];
    // eslint-disable-next-line no-script-url
    const scriptUrl = 'javascript:alert(1)';
    const invalid = [
      '', ' ', 'hero.png', './hero.png', './media_xyz.png', '/content/dam/hero.png',
      'data:image/png;base64,AAAA', scriptUrl, 'ftp://example.com/hero.png',
      'https://127.0.0.1/hero.png', 'https://example.com:12345/hero.png', 'https://example.com/a b.png',
    ];
    SHARED_SCHEMAS.forEach(({ $id, properties }) => {
      const pattern = new RegExp(properties.src.pattern);
      valid.forEach((src) => expect(pattern.test(src), `${$id} ${src}`).to.equal(true));
      invalid.forEach((src) => expect(pattern.test(src), `${$id} ${src}`).to.equal(false));
    });
  });
});

describe('registerSharedSchemas', () => {
  const schema = ($id) => ({ $id, type: 'object' });

  it('maps each schema by the path of its $id and freezes it', () => {
    const dashed = schema(`${ORIGIN}/schemas/shared/zx9-qk/v2.10.0.json`);
    const longest = schema(`${ORIGIN}/schemas/shared/${'a'.repeat(64)}/v1.0.0.json`);
    const byPath = registerSharedSchemas([dashed, longest]);
    expect([...byPath.keys()]).to.deep.equal([
      '/schemas/shared/zx9-qk/v2.10.0.json',
      `/schemas/shared/${'a'.repeat(64)}/v1.0.0.json`,
    ]);
    expect(byPath.get('/schemas/shared/zx9-qk/v2.10.0.json')).to.equal(dashed);
    expect(Object.isFrozen(dashed)).to.equal(true);
  });

  it('throws on an $id that is not a shared schema URL', () => {
    [
      undefined,
      42,
      'https://example.com/schemas/shared/image/v1.0.0.json',
      `${ORIGIN}.example.com/schemas/shared/image/v1.0.0.json`,
      `${ORIGIN}/schemas/image/v1.0.0.json`,
      `${ORIGIN}/schemas/shared/Image/v1.0.0.json`,
      `${ORIGIN}/schemas/shared/image-/v1.0.0.json`,
      `${ORIGIN}/schemas/shared/image/v1.0.json`,
      `${ORIGIN}/schemas/shared/image/v01.0.0.json`,
      `${ORIGIN}/schemas/shared/image/v1.0.0.json?draft`,
    ].forEach(($id) => {
      expect(() => registerSharedSchemas([schema($id)]), String($id)).to.throw('is not');
    });
  });

  it('throws on a name longer than 64 characters', () => {
    const $id = `${ORIGIN}/schemas/shared/${'a'.repeat(65)}/v1.0.0.json`;
    expect(() => registerSharedSchemas([schema($id)])).to.throw('longer than 64 characters');
  });

  it('throws on a duplicate $id', () => {
    const $id = `${ORIGIN}/schemas/shared/image/v1.0.0.json`;
    expect(() => registerSharedSchemas([schema($id), schema($id)])).to.throw('registered twice');
  });
});

describe('findSharedSchemaById', () => {
  it('finds a shared schema by its $id, and none for any other value', () => {
    SHARED_SCHEMAS.forEach((schema) => {
      expect(findSharedSchemaById(schema.$id), schema.$id).to.equal(schema);
    });
    [
      `${ORIGIN}/schemas/shared/image/v9.0.0.json`,
      `${ORIGIN}.example/schemas/shared/image/v1.0.0.json`,
      'https://example.com/schemas/shared/image/v1.0.0.json',
      '/schemas/shared/image/v1.0.0.json',
      undefined,
    ].forEach((id) => expect(findSharedSchemaById(id), String(id)).to.equal(undefined));
  });
});

describe('parseSharedSchemaName', () => {
  it('parses the name of a shared schema $id, also of a version this SDK lacks', () => {
    expect(parseSharedSchemaName(`${ORIGIN}/schemas/shared/image/v1.0.0.json`)).to.equal('image');
    expect(parseSharedSchemaName(`${ORIGIN}/schemas/shared/video-clip/v9.0.0.json`)).to.equal('video-clip');
    [
      `${ORIGIN}/schemas/image/v1.0.0.json`,
      'https://example.com/schemas/shared/image/v1.0.0.json',
      undefined,
    ].forEach((id) => expect(parseSharedSchemaName(id), String(id)).to.equal(undefined));
  });
});
