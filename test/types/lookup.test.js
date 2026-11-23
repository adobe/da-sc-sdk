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
import { getSharedSchema } from '../../src/index.js';
import catalog from '../../src/types/shared/index.js';
import image from '../../src/types/shared/image/v1.0.0.js';

// The name and version of a shared schema, read from its `$id`.
function nameAndVersion({ $id }) {
  const [, name, version] = $id.match(/\/([^/]+)\/v([^/]+)\.json$/);
  return { name, version };
}

const IMAGE = nameAndVersion(image);

describe('getSharedSchema', () => {
  it('returns the frozen schema with a name and version, the same object on every call', () => {
    const { schema } = getSharedSchema(IMAGE);
    expect(schema).to.equal(image);
    expect(Object.isFrozen(schema)).to.equal(true);
    expect(getSharedSchema(IMAGE).schema).to.equal(schema);
  });

  it('returns an error for a name and version without a schema', () => {
    [
      { ...IMAGE, version: '9.9.9' },
      { ...IMAGE, version: `v${IMAGE.version}` },
      { ...IMAGE, version: '1.0' },
      { ...IMAGE, name: 'Image' },
      { ...IMAGE, name: 'zx9-qk' },
      { name: `${IMAGE.name}/v${IMAGE.version}.json`, version: '' },
    ].forEach((options) => {
      expect(getSharedSchema(options), JSON.stringify(options))
        .to.deep.equal({ error: 'No shared schema has this name and version.' });
    });
  });

  it('returns an error for a name or version that is not a string, or no options', () => {
    [
      { version: IMAGE.version },
      { name: IMAGE.name },
      { ...IMAGE, version: 1 },
      { ...IMAGE, name: null },
    ].forEach((options) => {
      expect(getSharedSchema(options), JSON.stringify(options))
        .to.deep.equal({ error: 'The name and version must be strings.' });
    });
    expect(getSharedSchema()).to.deep.equal({ error: 'The name and version must be strings.' });
  });

  it('finds every shared schema by its name and version', () => {
    catalog.forEach((schema) => {
      expect(getSharedSchema(nameAndVersion(schema)).schema, schema.$id).to.equal(schema);
    });
  });
});
