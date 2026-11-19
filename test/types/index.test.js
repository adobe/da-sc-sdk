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
  ORIGIN, SHARED_SCHEMAS, findSharedSchemaByPath, registerSharedSchemas,
} from '../../src/types/index.js';

const pathOf = ({ $id }) => $id.slice(ORIGIN.length);

function expectDeepFrozen(value, at) {
  expect(Object.isFrozen(value), at).to.equal(true);
  Object.entries(value)
    .filter(([, child]) => child && typeof child === 'object')
    .forEach(([key, child]) => expectDeepFrozen(child, `${at}/${key}`));
}

describe('shared schemas', () => {
  it('registers every file in schemas/shared/ at its path, identical to its module', async () => {
    const paths = await executeServerCommand('list-shared-schemas');
    expect(SHARED_SCHEMAS.map(pathOf)).to.have.members(paths);
    await Promise.all(paths.map(async (path) => {
      const resp = await fetch(path);
      expect(findSharedSchemaByPath(path), path).to.deep.equal(await resp.json());
    }));
  });

  it('declares JSON Schema 2020-12 and freezes every object', () => {
    expect(Object.isFrozen(SHARED_SCHEMAS)).to.equal(true);
    SHARED_SCHEMAS.forEach((schema) => {
      expect(schema.$schema).to.equal('https://json-schema.org/draft/2020-12/schema');
      expectDeepFrozen(schema, schema.$id);
    });
  });

  it('defines an image as src and altText, requires src and allows nothing else', () => {
    const image = findSharedSchemaByPath('/schemas/shared/image/v1.0.0.json');
    expect(Object.keys(image.properties)).to.deep.equal(['src', 'altText']);
    expect(image.required).to.deep.equal(['src']);
    expect(image.additionalProperties).to.equal(false);
  });

  it('defines a file as src only, requires it and allows nothing else', () => {
    const file = findSharedSchemaByPath('/schemas/shared/file/v1.0.0.json');
    expect(Object.keys(file.properties)).to.deep.equal(['src']);
    expect(file.required).to.deep.equal(['src']);
    expect(file.additionalProperties).to.equal(false);
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
