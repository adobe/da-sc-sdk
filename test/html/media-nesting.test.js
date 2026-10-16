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
import { convertHtmlToJson } from '../../src/html/html2json.js';
import { save } from './test-utils.js';
import { IMAGE_SCHEMA_URL } from '../../src/index.js';

// A document with media at every nesting level the wire format supports: fields, arrays,
// objects in arrays, arrays of arrays and objects in objects, with text and files as siblings.

const media = { $ref: IMAGE_SCHEMA_URL };
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

// Images uploaded to DA, always written as images so EDS copies them into the media bus.
const images = {
  hero: 'https://content.da.live/org/site/events/.summit/hero.png',
  portraitTwo: 'https://content.da.live/org/site/events/.summit/speaker-two.jpeg',
  slideOne: 'https://content.da.live/org/site/events/.summit/slide-1.png',
  map: 'https://stage-content.da.live/org/site/events/.summit/map.svg',
  plan: 'https://content.da.live/org/site/events/.summit/plan.png',
};

// Images that AEM Assets delivers, written as links with `externalImagesAsLinks`.
const externalImages = {
  stage: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/stage.jpg',
  cover: 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/as/cover.avif',
  portraitOne: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/speaker-one.webp',
  slideTwo: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/slide-2.gif',
};

const files = {
  agenda: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/agenda.pdf',
  recording: 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:2/play',
  bio: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/speaker-one.docx',
  deck: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/deck.pptx',
};

// A text field whose value looks like an image URL must stay text.
const website = 'https://speaker-one.example.com/avatar.png';

const asset = (src, altText) => (altText === undefined ? { src } : { src, altText });

const data = {
  title: 'Summit',
  hero: asset(images.hero, 'Summit stage'),
  downloads: [asset(files.agenda), asset(externalImages.stage)],
  sessions: [
    {
      name: 'Keynote',
      cover: asset(externalImages.cover, 'Keynote cover'),
      recording: asset(files.recording),
      speakers: [
        {
          name: 'Speaker one',
          website,
          portrait: asset(externalImages.portraitOne),
          gallery: [asset(externalImages.stage), asset(files.bio)],
        },
        { name: 'Speaker two', portrait: asset(images.portraitTwo, 'Speaker "two"') },
      ],
      slides: [[asset(images.slideOne), asset(externalImages.slideTwo)], [asset(files.deck)]],
      venue: {
        address: 'Hall 1',
        map: asset(images.map),
        floor: { label: 'Level 2', plan: asset(images.plan) },
      },
    },
    { name: 'Workshop', cover: asset(externalImages.stage) },
  ],
};

const json = { metadata: { schemaName: 'event' }, data };

// Every asset value in document order, including repeated ones.
const assetValues = [
  images.hero, files.agenda, externalImages.stage, externalImages.cover, files.recording,
  externalImages.portraitOne, externalImages.stage, files.bio, images.portraitTwo,
  images.slideOne, externalImages.slideTwo, files.deck, images.map, images.plan,
  externalImages.stage,
];

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
const sorted = (values) => [...values].sort();

const extensionOf = (href) => new URL(href).pathname.split('.').pop();

// The media bus path EDS gives each distinct image, the same for repeated sources.
const allImages = [...Object.values(images), ...Object.values(externalImages)];
const mediaPaths = new Map(allImages.map((href, index) => [
  href, `media_${(index + 1).toString(16).padStart(40, '0')}.${extensionOf(href)}`,
]));

// Rewrites the DA source the way EDS delivers it on preview. Every image moves to the media
// bus and is wrapped in responsive picture markup. Links and text stay as they are.
function deliverLikeEds(html) {
  return html.replace(/<img src="([^"]+)" alt="([^"]*)">/g, (match, src, alt) => {
    const path = mediaPaths.get(src.replaceAll('&amp;', '&'));
    const extension = path.split('.').pop();
    return `<picture>
      <source type="image/webp" srcset="./${path}?width=2000&#x26;format=webply&#x26;optimize=medium" media="(min-width: 600px)">
      <source type="image/webp" srcset="./${path}?width=750&#x26;format=webply&#x26;optimize=medium">
      <img loading="lazy" alt="${alt}" src="./${path}?width=750&#x26;format=${extension}&#x26;optimize=medium" width="1200" height="800">
    </picture>`;
  });
}

function mapImages(value, toUrl, written) {
  if (Array.isArray(value)) {
    return value.map((item) => mapImages(item, toUrl, written));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, mapImages(item, toUrl, written)]));
  }
  return written.includes(value) ? toUrl(mediaPaths.get(value)) : value;
}

[
  { title: 'deeply nested media', config: undefined, imageValues: allImages },
  {
    title: 'deeply nested media with externalImagesAsLinks',
    config: { externalImagesAsLinks: true },
    imageValues: Object.values(images),
  },
].forEach(({ title, config, imageValues }) => describe(title, () => {
  const { html } = save({ json, schema, config });
  const written = parse(html);
  const writtenImages = assetValues.filter((value) => imageValues.includes(value));
  const writtenLinks = assetValues.filter((value) => !imageValues.includes(value));
  const deliver = (toUrl) => ({ ...json, data: mapImages(data, toUrl, imageValues) });

  it('writes images as images, other assets as links and text as text', () => {
    const sources = [...written.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    const links = [...written.querySelectorAll('a')]
      .map((link) => [link.getAttribute('href'), link.textContent]);
    expect(sorted(sources)).to.deep.equal(sorted(writtenImages));
    expect(sorted(links)).to.deep.equal(sorted(writtenLinks.map((href) => [href, href])));
    expect(html).to.include(`<p>${website}</p>`);
  });

  it('writes one block for every nested object, array and asset', () => {
    const blocks = [...written.querySelectorAll('main > div > div')]
      .map((block) => block.classList[0]);
    const assets = [
      'hero',
      'downloads', 'downloads',
      'cover', 'cover', 'recording',
      'portrait', 'portrait', 'gallery', 'gallery',
      'slides', 'slides', 'slides',
      'map', 'plan',
    ];
    expect(sorted(blocks)).to.deep.equal(sorted([
      'da-form', 'event',
      'sessions', 'sessions',
      'speakers', 'speakers',
      'slides', 'slides',
      'venue', 'floor',
      ...assets,
    ]));
  });

  it('references every asset like an object, with its alt text on the image', () => {
    expect(html).not.to.include('self://asset#');
    const rows = (block) => [...block.children].map((row) => row.firstElementChild.textContent);
    const assets = [...written.querySelectorAll('main > div > div')]
      .filter((block) => rows(block)[0] === 'src');
    expect(assets).to.have.length(assetValues.length);
    const hero = assets.find((block) => block.classList[0] === 'hero');
    expect(rows(hero)).to.deep.equal(['src', 'altText']);
    expect(hero.querySelector('img').getAttribute('alt')).to.equal('Summit stage');
    expect(html).to.include('alt="Speaker &quot;two&quot;"');
  });

  it('reads the DA source back to the same document', () => {
    expect(convertHtmlToJson({ html }).json).to.deep.equal(json);
  });

  it('reads the delivered page back to the same document with media bus paths', () => {
    const { json: delivered } = convertHtmlToJson({ html: deliverLikeEds(html) });
    expect(delivered).to.deep.equal(deliver((path) => `./${path}`));
  });

  it('reads the delivered page with absolute media URLs resolved against the page', () => {
    const folder = 'https://main--site--org.aem.live/events';
    const { json: delivered } = convertHtmlToJson({
      html: deliverLikeEds(html),
      asset: { base: `${folder}/summit` },
    });
    expect(delivered).to.deep.equal(deliver((path) => `${folder}/${path}`));
  });

  it('writes the read document to the same structure again', () => {
    const { json: read } = convertHtmlToJson({ html });
    const { html: rewritten } = save({ json: read, schema, config });
    expect(convertHtmlToJson({ html: rewritten }).json).to.deep.equal(json);
    expect(rewritten.replace(/-[a-z0-9]{1,6}\b/g, '-ID'))
      .to.equal(html.replace(/-[a-z0-9]{1,6}\b/g, '-ID'));
  });
}));
