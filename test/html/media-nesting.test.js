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
import { convertJsonToHtml } from '../../src/html/json2html.js';
import { convertHtmlToJson } from '../../src/html/html2json.js';

// A document with media at every nesting level the wire format supports: fields, arrays,
// objects in arrays, arrays of arrays and objects in objects, with text and files as siblings.

const media = { type: 'string', 'x-semantic-type': 'media' };
const text = { type: 'string' };

const schema = {
  type: 'object',
  properties: {
    title: text,
    hero: media,
    downloads: { type: 'array', items: media },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: text,
          cover: media,
          recording: media,
          speakers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: text,
                website: text,
                portrait: media,
                gallery: { type: 'array', items: media },
              },
            },
          },
          slides: { type: 'array', items: { type: 'array', items: media } },
          venue: {
            type: 'object',
            properties: {
              address: text,
              map: media,
              floor: { type: 'object', properties: { label: text, plan: media } },
            },
          },
        },
      },
    },
  },
};

const images = {
  hero: 'https://content.da.live/org/site/events/.summit/hero.png',
  stage: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/stage.jpg',
  cover: 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/as/cover.avif',
  portraitOne: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/speaker-one.webp',
  portraitTwo: 'https://content.da.live/org/site/events/.summit/speaker-two.jpeg',
  slideOne: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/slide-1.png',
  slideTwo: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/slide-2.gif',
  map: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/map.svg',
  plan: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/plan.png',
};

const files = {
  agenda: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/agenda.pdf',
  recording: 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:2/play',
  bio: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/speaker-one.docx',
  deck: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/deck.pptx',
};

// A text field whose value looks like an image URL must stay text.
const website = 'https://speaker-one.example.com/avatar.png';

const data = {
  title: 'Summit',
  hero: images.hero,
  downloads: [files.agenda, images.stage],
  sessions: [
    {
      name: 'Keynote',
      cover: images.cover,
      recording: files.recording,
      speakers: [
        {
          name: 'Speaker one',
          website,
          portrait: images.portraitOne,
          gallery: [images.stage, files.bio],
        },
        { name: 'Speaker two', portrait: images.portraitTwo },
      ],
      slides: [[images.slideOne, images.slideTwo], [files.deck]],
      venue: {
        address: 'Hall 1',
        map: images.map,
        floor: { label: 'Level 2', plan: images.plan },
      },
    },
    { name: 'Workshop', cover: images.stage },
  ],
};

const json = { metadata: { schemaName: 'event' }, data };

// Every image value in document order, including repeated ones.
const imageValues = [
  images.hero, images.stage, images.cover, images.portraitOne, images.stage,
  images.portraitTwo, images.slideOne, images.slideTwo, images.map, images.plan, images.stage,
];
const fileValues = [files.agenda, files.recording, files.bio, files.deck];

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
const sorted = (values) => [...values].sort();

const extensionOf = (href) => new URL(href).pathname.split('.').pop();

// The media bus path EDS gives each distinct image, the same for repeated sources.
const mediaPaths = new Map(Object.values(images).map((href, index) => [
  href, `media_${(index + 1).toString(16).padStart(40, '0')}.${extensionOf(href)}`,
]));

// Rewrites the DA source the way EDS delivers it on preview. Every image moves to the media
// bus and is wrapped in responsive picture markup. Links and text stay as they are.
function deliverLikeEds(html) {
  return html.replace(/<img src="([^"]+)" alt="">/g, (match, src) => {
    const path = mediaPaths.get(src.replaceAll('&amp;', '&'));
    const extension = path.split('.').pop();
    return `<picture>
      <source type="image/webp" srcset="./${path}?width=2000&#x26;format=webply&#x26;optimize=medium" media="(min-width: 600px)">
      <source type="image/webp" srcset="./${path}?width=750&#x26;format=webply&#x26;optimize=medium">
      <img loading="lazy" alt="" src="./${path}?width=750&#x26;format=${extension}&#x26;optimize=medium" width="1200" height="800">
    </picture>`;
  });
}

function mapImages(value, toUrl) {
  if (Array.isArray(value)) {
    return value.map((item) => mapImages(item, toUrl));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, mapImages(item, toUrl)]));
  }
  return mediaPaths.has(value) ? toUrl(mediaPaths.get(value)) : value;
}

describe('deeply nested media', () => {
  const { html } = convertJsonToHtml({ json, schema });
  const written = parse(html);

  it('writes every image as an image, every file as a link and every text as text', () => {
    const sources = [...written.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    const links = [...written.querySelectorAll('a')]
      .map((link) => [link.getAttribute('href'), link.textContent]);
    expect(sorted(sources)).to.deep.equal(sorted(imageValues));
    expect(sorted(links)).to.deep.equal(sorted(fileValues.map((href) => [href, href])));
    expect(html).to.include(`<p>${website}</p>`);
  });

  it('writes one block for every nested object and array', () => {
    const blocks = [...written.querySelectorAll('main > div > div')]
      .map((block) => block.classList[0]);
    expect(sorted(blocks)).to.deep.equal(sorted([
      'da-form', 'event',
      'sessions', 'sessions',
      'speakers', 'speakers',
      'slides', 'slides',
      'venue', 'floor',
    ]));
  });

  it('reads the DA source back to the same document', () => {
    expect(convertHtmlToJson({ html }).json).to.deep.equal(json);
  });

  it('reads the delivered page back to the same document with media bus paths', () => {
    const { json: delivered } = convertHtmlToJson({ html: deliverLikeEds(html) });
    expect(delivered).to.deep.equal({
      ...json,
      data: mapImages(data, (path) => `./${path}`),
    });
  });

  it('reads the delivered page with absolute media URLs resolved against the page', () => {
    const folder = 'https://main--site--org.aem.live/events';
    const { json: delivered } = convertHtmlToJson({
      html: deliverLikeEds(html),
      media: { base: `${folder}/summit` },
    });
    expect(delivered).to.deep.equal({
      ...json,
      data: mapImages(data, (path) => `${folder}/${path}`),
    });
  });

  it('writes the read document to the same structure again', () => {
    const { json: read } = convertHtmlToJson({ html });
    const { html: rewritten } = convertJsonToHtml({ json: read, schema });
    expect(convertHtmlToJson({ html: rewritten }).json).to.deep.equal(json);
    expect(rewritten.replace(/-[a-z0-9]{1,6}\b/g, '-ID'))
      .to.equal(html.replace(/-[a-z0-9]{1,6}\b/g, '-ID'));
  });
});
