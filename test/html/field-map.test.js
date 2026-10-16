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
import { IMAGE_SCHEMA_URL, createEngine } from '../../src/index.js';
import { fieldMap } from '../../src/html/field-map.js';

const asset = { $ref: IMAGE_SCHEMA_URL };

const schema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    hero: asset,
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          caption: { type: 'string' },
          images: { type: 'array', items: asset },
        },
      },
    },
  },
};

const modelOf = (data) => createEngine({
  schema,
  document: { metadata: { schemaName: 'deck' }, data },
}).getState().model;

describe('fieldMap', () => {
  it('maps object fields by key and keeps their semantic type', () => {
    const map = fieldMap(modelOf({}));
    expect(map.children.get('title')).to.deep.equal({});
    expect(map.children.get('hero').semanticType).to.equal('asset');
    expect([...map.children.get('hero').children.keys()]).to.deep.equal(['src', 'altText']);
  });

  it('merges all array items into one item field', () => {
    // Only the second slide has images, so the first item alone would miss them.
    const map = fieldMap(modelOf({
      slides: [{ caption: 'a', images: [] }, { images: [{ src: 'x.png' }, { src: 'y.png' }] }],
    }));
    const slide = map.children.get('slides').item;
    expect(slide.children.get('caption')).to.deep.equal({});
    expect(slide.children.get('images').item.semanticType).to.equal('asset');
  });

  it('has no item field for an array without items', () => {
    const map = fieldMap(modelOf({ slides: [] }));
    expect(map.children.get('slides').item).to.equal(null);
  });

  it('returns null for anything that is not a model', () => {
    [undefined, null, 'model', 42, [], {}, { root: null }, { root: 'x' }].forEach((model) => {
      expect(fieldMap(model)).to.equal(null);
    });
  });
});
