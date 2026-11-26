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
import { readFile } from '@web/test-runner-commands';
import { convertHtmlToJson } from '../../src/html/html2json.js';
import { save } from './test-utils.js';
import image from '../../src/types/shared/image/1.0.0.js';

// Fixtures captured from a real document, with anonymized content, hosts and IDs.
// `mediaForm.da.html` is the DA source the editor saved, with an AEM Assets
// image and an uploaded image. `mediaForm.eds.html` is the page EDS delivered
// after preview, with both images in the media bus and wrapped in `<picture>`.
// Both were captured when media values were plain strings with the image inline
// in the field cell. The reader only takes an image from a `src` row, so each
// image cell was moved into a block of its own, as the writer saves it.
// The image markup itself is unchanged.

const schema = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    hero: { $ref: image.$id },
    thumbnail: { $ref: image.$id },
  },
};

const readFixture = async (name) => readFile({ path: `./mocks/${name}` });
const readJsonFixture = async (name) => JSON.parse(await readFixture(name));

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

// Every image as the class of its block, its row and its alt text, in document order.
const images = (html) => [...parse(html).querySelectorAll('main > div > div img')]
  .map((img) => [
    img.closest('main > div > div').classList[0],
    img.closest('main > div > div > div').firstElementChild.textContent,
    img.getAttribute('alt'),
  ]);

describe('media fields from editor to delivery', () => {
  it('writes every media value as an object block with its image in the src row', async () => {
    const json = await readJsonFixture('mediaForm.da.json');
    json.data.hero.alt = 'Hero';
    const { html } = save({ json, schema });
    expect(images(html)).to.deep.equal([['hero', 'src', 'Hero'], ['thumbnail', 'src', '']]);
    expect(convertHtmlToJson({ html }).json).to.deep.equal(json);
  });

  it('reads the DA source back to the original image URLs', async () => {
    const html = await readFixture('mediaForm.da.html');
    const expected = await readJsonFixture('mediaForm.da.json');
    expect(convertHtmlToJson({ html }).json).to.deep.equal(expected);
  });

  it('reads the delivered EDS page to media bus paths relative to the page', async () => {
    const html = await readFixture('mediaForm.eds.html');
    const expected = await readJsonFixture('mediaForm.eds.json');
    expect(convertHtmlToJson({ html }).json).to.deep.equal(expected);
  });

  it('keeps the same document shape from DA source to delivered page', async () => {
    const source = convertHtmlToJson({ html: await readFixture('mediaForm.da.html') }).json;
    const delivered = convertHtmlToJson({ html: await readFixture('mediaForm.eds.html') }).json;
    expect(delivered.metadata).to.deep.equal(source.metadata);
    expect(Object.keys(delivered.data)).to.deep.equal(Object.keys(source.data));
    expect(delivered.data.headline).to.equal(source.data.headline);
  });
});

// The same way for a document whose image sits in an object inside an object, next to text,
// numbers, a list and nested references.
describe('nested media fields from editor to delivery', () => {
  const nestedSchema = {
    type: 'object',
    properties: {
      media: {
        type: 'object',
        properties: {
          profileImage: { $ref: image.$id },
        },
      },
    },
  };

  it('writes the nested media value with its alt text and keeps its other properties', async () => {
    const json = await readJsonFixture('nestedMediaForm.da.json');
    const { html } = save({ json, schema: nestedSchema });
    expect(images(html)).to.deep.equal([['profileimage', 'src', json.data.media.profileImage.alt]]);
    expect(convertHtmlToJson({ html }).json).to.deep.equal(json);
  });

  it('reads the DA source back to the original image URL', async () => {
    const html = await readFixture('nestedMediaForm.da.html');
    const expected = await readJsonFixture('nestedMediaForm.da.json');
    expect(convertHtmlToJson({ html }).json).to.deep.equal(expected);
  });

  it('reads the delivered EDS page to a media bus path relative to the page', async () => {
    const html = await readFixture('nestedMediaForm.eds.html');
    const expected = await readJsonFixture('nestedMediaForm.eds.json');
    expect(convertHtmlToJson({ html }).json).to.deep.equal(expected);
  });

  it('keeps everything but the image the same from DA source to delivered page', async () => {
    const source = convertHtmlToJson({ html: await readFixture('nestedMediaForm.da.html') }).json;
    const delivered = convertHtmlToJson({ html: await readFixture('nestedMediaForm.eds.html') }).json;
    expect(delivered.data.media.profileImage.src)
      .to.equal('./media_1f2e3d4c5b6a79801f2e3d4c5b6a79801f2e3d4c5.jpg');
    delivered.data.media.profileImage.src = source.data.media.profileImage.src;
    expect(delivered).to.deep.equal(source);
  });
});
