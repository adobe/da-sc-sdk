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
import { convertJsonToHtml } from '../../src/html/json2html.js';
import { convertHtmlToJson } from '../../src/html/html2json.js';
import { cleanHtmlWhitespace } from './test-utils.js';

// Fixtures captured from a real document, with anonymized content, hosts and IDs.
// `mediaForm.da.html` is the DA source the editor saved, with an AEM Assets
// image and an uploaded image. `mediaForm.eds.html` is the page EDS delivered
// after preview, with both images in the media bus and wrapped in `<picture>`.

const schema = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    hero: { type: 'string', 'x-semantic-type': 'media' },
    thumbnail: { type: 'string', 'x-semantic-type': 'media' },
  },
};

const readFixture = async (name) => readFile({ path: `./mocks/${name}` });
const readJsonFixture = async (name) => JSON.parse(await readFixture(name));

describe('media fields from editor to delivery', () => {
  it('writes exactly the DA source the editor saved', async () => {
    const json = await readJsonFixture('mediaForm.da.json');
    // The fixture is pretty-printed for reading. The editor saves it on one line.
    const saved = cleanHtmlWhitespace(await readFixture('mediaForm.da.html'));
    expect(convertJsonToHtml({ json, schema }).html).to.equal(saved);
  });

  it('reads the DA source back to the original image URLs', async () => {
    const html = await readFixture('mediaForm.da.html');
    const expected = await readJsonFixture('mediaForm.da.json');
    expect(convertHtmlToJson({ html }).json).to.deep.equal(expected);
  });

  it('reads the delivered EDS page to absolute media URLs on the site origin, as da-sc does', async () => {
    const html = await readFixture('mediaForm.eds.html');
    const expected = await readJsonFixture('mediaForm.eds.json');
    const { json } = convertHtmlToJson({ html, media: { origin: 'https://main--site--org.aem.live' } });
    expect(json).to.deep.equal(expected);
  });

  it('keeps media bus paths relative to the page without an origin', async () => {
    const html = await readFixture('mediaForm.eds.html');
    const { data } = convertHtmlToJson({ html }).json;
    expect(data.hero).to.equal('./media_1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5.jpg');
    expect(data.thumbnail).to.equal('./media_1f1e1d1c1b1a19181716151413121110f0e0d0c0b.png');
  });

  it('keeps the same document shape from DA source to delivered page', async () => {
    const source = convertHtmlToJson({ html: await readFixture('mediaForm.da.html') }).json;
    const delivered = convertHtmlToJson({ html: await readFixture('mediaForm.eds.html') }).json;
    expect(delivered.metadata).to.deep.equal(source.metadata);
    expect(Object.keys(delivered.data)).to.deep.equal(Object.keys(source.data));
    expect(delivered.data.headline).to.equal(source.data.headline);
  });
});
