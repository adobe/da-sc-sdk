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
import { SHARED_SCHEMAS, parseSharedSchemaName } from '../../src/types/index.js';
import {
  MEDIA_SCHEMA_NAMES, MEDIA_SOURCE_PROPERTY, isMediaSourceField,
} from '../../src/types/media.js';

describe('isMediaSourceField', () => {
  it('finds the source of an image or a file', () => {
    expect(isMediaSourceField({ sharedSchemaName: 'image', propertyName: 'src' })).to.equal(true);
    expect(isMediaSourceField({ sharedSchemaName: 'file', propertyName: 'src' })).to.equal(true);
  });

  it('finds no source in other properties or shared schemas', () => {
    expect(isMediaSourceField({ sharedSchemaName: 'image', propertyName: 'alt' })).to.equal(false);
    expect(isMediaSourceField({ sharedSchemaName: 'video', propertyName: 'src' })).to.equal(false);
    expect(isMediaSourceField({ sharedSchemaName: undefined, propertyName: 'src' })).to.equal(false);
  });

  it('names only media schemas whose every version constrains its source with a pattern', () => {
    Object.values(MEDIA_SCHEMA_NAMES).forEach((name) => {
      const versions = SHARED_SCHEMAS.filter(({ $id }) => parseSharedSchemaName($id) === name);
      expect(versions, name).to.not.be.empty;
      versions.forEach((schema) => {
        expect(schema.properties[MEDIA_SOURCE_PROPERTY]?.pattern, schema.$id).to.be.a('string');
      });
    });
  });
});
