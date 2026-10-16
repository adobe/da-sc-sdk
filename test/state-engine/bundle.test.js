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
} from '../../src/index.js';

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
