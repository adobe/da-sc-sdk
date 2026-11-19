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
import { getSharedSchemaByPath, getSharedSchemas } from '../../src/index.js';
import { ORIGIN } from '../../src/types/index.js';
import catalog from '../../src/types/shared/index.js';
import image from '../../src/types/shared/image/v1.0.0.js';

const IMAGE_PATH = image.$id.slice(ORIGIN.length);

describe('getSharedSchemaByPath', () => {
  it('returns the frozen schema at a path, the same object on every call', () => {
    const { schema } = getSharedSchemaByPath({ path: IMAGE_PATH });
    expect(schema).to.equal(image);
    expect(Object.isFrozen(schema)).to.equal(true);
    expect(getSharedSchemaByPath({ path: IMAGE_PATH }).schema).to.equal(schema);
  });

  it('returns an error for a path without a schema', () => {
    [
      '/schemas/shared/image/v1.0.0',
      '/schemas/shared/image/latest.json',
      '/schemas/shared/image/v9.9.9.json',
      image.$id,
      `${IMAGE_PATH}?draft`,
    ].forEach((path) => {
      expect(getSharedSchemaByPath({ path }), path).to.deep.equal({ error: 'No shared schema has this path.' });
    });
  });

  it('returns an error for a path that is not a string, or no options', () => {
    [undefined, null, 42, new URL(`https://example.com${IMAGE_PATH}`)].forEach((path) => {
      expect(getSharedSchemaByPath({ path }), String(path)).to.deep.equal({ error: 'The path must be a string.' });
    });
    expect(getSharedSchemaByPath()).to.deep.equal({ error: 'The path must be a string.' });
  });
});

describe('getSharedSchemas', () => {
  it('returns every schema in a frozen list, the same on every call', () => {
    const { schemas } = getSharedSchemas();
    expect(schemas).to.have.members(catalog);
    expect(Object.isFrozen(schemas)).to.equal(true);
    expect(getSharedSchemas().schemas).to.equal(schemas);
  });

  it('lists the schemas that getSharedSchemaByPath finds', () => {
    getSharedSchemas().schemas.forEach((schema) => {
      const { pathname } = new URL(schema.$id);
      expect(getSharedSchemaByPath({ path: pathname }).schema, pathname).to.equal(schema);
    });
  });
});
