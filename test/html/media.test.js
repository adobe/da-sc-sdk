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
import { isIngestedImage, isMediaImage } from '../../src/html/media.js';
import { createEngine } from '../../src/index.js';
import { modelOf, save } from './test-utils.js';

const media = (title) => ({ type: 'string', title, 'x-semantic-type': 'asset' });

const schema = {
  type: 'object',
  properties: {
    hero: media('Hero'),
    caption: { type: 'string' },
    gallery: { type: 'array', items: media('Photo') },
    sponsor: { type: 'object', properties: { logo: media('Logo'), name: { type: 'string' } } },
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, slides: { type: 'array', items: media('Slide') } },
      },
    },
    fit: { type: 'string', enum: ['cover'], 'x-semantic-type': 'asset' },
    day: { type: 'string', format: 'date', 'x-semantic-type': 'asset' },
  },
};

const sources = {
  upload: 'https://content.da.live/org/site/drafts/.page/hero.png',
  hlx6: './media_1a2b3c.png',
  publish: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/hero.jpg',
  smartCrop: 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/as/hero.avif?smartcrop=wide&width=1920',
};

const files = {
  pdf: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/datasheet.pdf',
  video: 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:2/play',
  audio: 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:3/original/as/theme.mp3',
};

const doc = (data) => ({ metadata: { schemaName: 'player' }, data });

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

const imageSources = (html) => [...parse(html).querySelectorAll('img')]
  .map((img) => img.getAttribute('src'));

// Every asset written as an image or a link, in document order.
const assetSources = (html) => [...parse(html).querySelectorAll('img, a')]
  .map((el) => el.getAttribute('src') ?? el.getAttribute('href'));

const writeHero = (value, withSchema) => save({
  json: doc({ hero: value }),
  schema: withSchema,
}).html;

// A delivered page whose single field `hero` has the given value cell.
const page = (cell) => `<body><main><div>
  <div class="da-form"><div><div><h3>x-schema-name</h3></div><div><p>player</p></div></div></div>
  <div class="player"><div><div><h3>hero</h3></div>${cell}</div></div>
</div></main></body>`;

const readHero = (cell) => convertHtmlToJson({ html: page(cell) }).json.data.hero;

describe('media fields', () => {
  describe('writing', () => {
    it('writes media fields as images and other strings as text', () => {
      const { html } = save({
        json: doc({ hero: sources.upload, caption: sources.upload }),
        schema,
      });
      expect(imageSources(html)).to.deep.equal([sources.upload]);
      expect(parse(html).querySelector('img').getAttribute('alt')).to.equal('');
      expect(html).to.include(`<p>${sources.upload}</p>`);
    });

    it('writes media in array items, nested objects and nested arrays', () => {
      const { html } = save({
        json: doc({
          gallery: [sources.publish, sources.hlx6],
          sponsor: { logo: sources.upload, name: 'Acme' },
          chapters: [{ slides: [sources.smartCrop] }],
        }),
        schema,
      });
      expect(assetSources(html)).to.have.members([
        sources.publish, sources.hlx6, sources.upload, sources.smartCrop,
      ]);
      expect(html).to.include('<p>Acme</p>');
    });

    it('writes media items of a root array and of arrays of arrays', () => {
      const rootArray = save({
        json: doc([sources.upload]),
        schema: { type: 'array', items: media('Photo') },
      }).html;
      expect(imageSources(rootArray)).to.deep.equal([sources.upload]);

      const nested = save({
        json: doc({ grid: [[sources.publish]] }),
        schema: {
          type: 'object',
          properties: { grid: { type: 'array', items: { type: 'array', items: media('Cell') } } },
        },
      }).html;
      expect(assetSources(nested)).to.deep.equal([sources.publish]);
    });

    it('resolves media fields through $ref', () => {
      const html = writeHero(sources.upload, {
        $defs: { image: media('Image') },
        type: 'object',
        properties: { hero: { $ref: '#/$defs/image' } },
      });
      expect(imageSources(html)).to.deep.equal([sources.upload]);
    });

    it('escapes the image source', () => {
      expect(writeHero('https://x.test/a.png?a=1&b="2"', schema))
        .to.include('src="https://x.test/a.png?a=1&amp;b=&quot;2&quot;"');
    });

    it('keeps images uploaded to DA and media bus images as images with externalImagesAsLinks', () => {
      const uploads = [
        sources.upload,
        'https://stage-content.da.live/org/site/.page/hero.webp',
        sources.hlx6,
      ];
      uploads.forEach((src) => {
        const config = { externalImagesAsLinks: true };
        const { html } = save({ json: doc({ hero: src }), schema, config });
        expect(imageSources(html), src).to.deep.equal([src]);
        expect(html, src).to.not.include('<a ');
      });
    });

    const otherHosts = [
      sources.publish,
      sources.smartCrop,
      'https://images.example.com/hero.png',
      'http://content.da.live/org/site/hero.png',
      'https://content.da.live.example.com/hero.png',
      'https://admin.da.live/source/org/site/hero.png',
    ];

    it('writes images from any host as images by default', () => {
      otherHosts.forEach((src) => {
        const html = writeHero(src, schema);
        expect(imageSources(html), src).to.deep.equal([src]);
        expect(html, src).to.not.include('<a ');
      });
    });

    it('writes images as images when config is empty or null', () => {
      [{}, null, { externalImagesAsLinks: false }].forEach((config) => {
        const { html } = save({ json: doc({ hero: sources.publish }), schema, config });
        expect(imageSources(html), JSON.stringify(config)).to.deep.equal([sources.publish]);
      });
    });

    it('writes images from other hosts as links with externalImagesAsLinks, so EDS keeps their URL', () => {
      otherHosts.forEach((src) => {
        const json = doc({ hero: src });
        const { html } = save({ json, schema, config: { externalImagesAsLinks: true } });
        expect(imageSources(html), src).to.deep.equal([]);
        expect(assetSources(html), src).to.deep.equal([src]);
        expect(convertHtmlToJson({ html }).json.data.hero, src).to.equal(src);
      });
    });

    it('writes sources that are not media bus paths or http(s) URLs as text', () => {
      // eslint-disable-next-line no-script-url
      const scriptUrl = 'javascript:alert(1)';
      [
        scriptUrl,
        ' JavaScript:alert(1).png',
        'data:image/png;base64,AAAA',
        'vbscript:msgbox(1)',
        'file:///etc/passwd.png',
        '//cdn.example.com/hero.png',
        '/content/dam/hero.png',
        'hero.png',
        './media_ab12.png"><script>',
      ].forEach((value) => {
        const html = writeHero(value, schema);
        expect(html, value).to.not.include('<img');
        expect(html, value).to.not.include('<a ');
        expect(parse(html).querySelector('script'), value).to.equal(null);
      });
      expect(writeHero(scriptUrl, schema)).to.include(`<p>${scriptUrl}</p>`);
    });

    it('lets enum and date formats take precedence over the media hint', () => {
      const { html } = save({ json: doc({ fit: 'cover', day: '2026-01-01' }), schema });
      expect(html).to.not.include('<img');
    });

    it('stores media bus paths without rendition parameters and trims sources', () => {
      expect(imageSources(writeHero(' ./media_ab12.png?width=750#width=800 ', schema)))
        .to.deep.equal(['./media_ab12.png']);
      expect(assetSources(writeHero(` ${sources.smartCrop} `, schema)))
        .to.deep.equal([sources.smartCrop]);
    });

    it('writes non-string values of a media field as text', () => {
      const html = writeHero(5, schema);
      expect(html).to.not.include('<img');
      expect(html).to.include('<p>5</p>');
    });

    it('writes data that does not match the schema as text', () => {
      const { html } = save({ json: doc({ hero: { url: sources.upload } }), schema });
      expect(html).to.not.include('<img');
    });

    it('falls back to text for anything that is not a model', () => {
      const json = doc({ hero: sources.upload });
      const textOnly = convertJsonToHtml({ json }).html;
      const unusable = modelOf({ oneOf: [media('A'), media('B')] }, json);
      [undefined, null, 'model', 42, [], {}, { root: null }, schema, unusable].forEach((invalid) => {
        expect(convertJsonToHtml({ json, model: invalid }).html).to.equal(textOnly);
      });
    });

    it('finds media in array items that pruning moved', () => {
      // The empty first chapter is pruned, so the second one is written at index 0.
      const json = doc({
        chapters: [{ slides: [''] }, { slides: [sources.publish, sources.upload] }],
      });
      expect(assetSources(save({ json, schema }).html))
        .to.deep.equal([sources.publish, sources.upload]);
    });

    it('finds media in array items when only a later item has that field', () => {
      // The first chapter has no slides, so only the second one shows they are media.
      const json = doc({ chapters: [{ title: 'Intro', slides: [] }, { slides: [sources.publish] }] });
      expect(assetSources(save({ json, schema }).html)).to.deep.equal([sources.publish]);
    });

    it('writes array items as text when the model has no items for that array', () => {
      const json = doc({ hero: sources.upload, gallery: [sources.publish] });
      const { html } = convertJsonToHtml({ json, model: modelOf(schema, doc({})) });
      expect(imageSources(html)).to.deep.equal([sources.upload]);
      expect(html).to.include(`<li>${sources.publish}</li>`);
    });

    it('writes long-text fields as text', () => {
      const { html } = save({
        json: doc({ summary: sources.upload }),
        schema: { type: 'object', properties: { summary: { type: 'string', 'x-semantic-type': 'long-text' } } },
      });
      expect(html).to.not.include('<img');
      expect(html).to.include(`<p>${sources.upload}</p>`);
    });

    it('writes media of supported fields next to an unsupported composition', () => {
      const { html } = save({
        json: doc({ hero: sources.upload, choice: sources.publish }),
        schema: {
          type: 'object',
          properties: { hero: media('Hero'), choice: { oneOf: [media('A'), media('B')] } },
        },
      });
      expect(imageSources(html)).to.deep.equal([sources.upload]);
      expect(html).to.include(`<p>${sources.publish}</p>`);
    });

    it('writes media from the model of an engine after edits', () => {
      const engine = createEngine({ schema, document: doc({}) });
      engine.addItem('/data/chapters');
      engine.addItem('/data/chapters');
      engine.addItem('/data/chapters/1/slides');
      engine.setField('/data/chapters/1/slides/0', sources.publish);
      engine.addItem('/data/gallery');
      engine.setField('/data/gallery/0', sources.hlx6);
      engine.addItem('/data/gallery');
      engine.setField('/data/gallery/1', sources.upload);
      engine.moveItem('/data/gallery', 1, 0);
      engine.removeItem('/data/gallery/1');
      const { document, model } = engine.getState();
      const { html } = convertJsonToHtml({ json: document, model });
      expect(assetSources(html)).to.have.members([sources.upload, sources.publish]);
      expect(convertHtmlToJson({ html }).json.data.gallery).to.deep.equal([sources.upload]);
    });

    it('writes the same HTML as before when no model is given', () => {
      const json = doc({ hero: sources.upload, gallery: [sources.publish] });
      expect(convertJsonToHtml({ json }).html).to.equal('<body><header></header><main><div>'
        + '<div class="da-form"><div><div><h3>x-schema-name</h3></div><div><p>player</p></div></div></div>'
        + '<div class="player">'
        + `<div><div><h3>hero</h3></div><div><p>${sources.upload}</p></div></div>`
        + `<div><div><h3>gallery</h3></div><div><ul><li>${sources.publish}</li></ul></div></div>`
        + '</div></div></main><footer></footer></body>');
    });
  });

  describe('asset blocks', () => {
    const blocks = (html) => [...parse(html).querySelectorAll('main > div > div')];
    const rowKeys = (block) => [...block.children]
      .map((row) => row.firstElementChild.textContent.trim());
    const refOf = (block) => `self://asset#${block.classList[1].toLowerCase()}`;

    // A delivered page whose `hero` field holds `ref`, followed by a `hero-abc`
    // block with the given rows.
    const assetPage = (rows, ref = 'self://asset#hero-abc') => `<body><main><div>
      <div class="da-form"><div><div><h3>x-schema-name</h3></div><div><p>player</p></div></div></div>
      <div class="player"><div><div><h3>hero</h3></div><div><p>${ref}</p></div></div></div>
      <div class="hero hero-abc">${rows}</div>
    </div></main></body>`;
    const propRow = (key, cell) => `<div><div><h3>${key}</h3></div>${cell}</div>`;
    const readAsset = (cell, asset) => convertHtmlToJson({ html: assetPage(propRow('asset', cell)), asset })
      .json.data.hero;

    it('writes an asset field as a self://asset# reference to a block with an asset row', () => {
      const html = writeHero(sources.upload, schema);
      const [, root, hero] = blocks(html);
      expect(hero.classList[0]).to.equal('hero');
      expect(rowKeys(hero)).to.deep.equal(['asset']);
      expect(hero.querySelector('img').getAttribute('src')).to.equal(sources.upload);
      expect(root.textContent).to.include(refOf(hero));
      expect(root.querySelector('img')).to.equal(null);
    });

    it('writes asset items of arrays as references to asset blocks', () => {
      const { html } = save({ json: doc({ gallery: [sources.publish, files.pdf] }), schema });
      const assets = blocks(html).filter((block) => block.classList[0] === 'gallery');
      expect(assets.map(rowKeys)).to.deep.equal([['asset'], ['asset']]);
      const items = [...parse(html).querySelectorAll('li')].map((li) => li.textContent);
      expect(items).to.deep.equal(assets.map(refOf));
      expect(assets[1].querySelector('a').getAttribute('href')).to.equal(files.pdf);
    });

    it('keeps references to objects untyped', () => {
      const { html } = save({ json: doc({ sponsor: { logo: sources.upload } }), schema });
      expect(html).to.match(/self:\/\/#sponsor-[a-z0-9]+/);
      expect(html).to.match(/self:\/\/asset#logo-[a-z0-9]+/);
    });

    it('reads a typeless reference to the same block as an object', () => {
      const html = assetPage(propRow('name', '<div>Ada</div>'), 'self://#hero-abc');
      expect(convertHtmlToJson({ html }).json.data.hero).to.deep.equal({ name: 'Ada' });
    });

    it('keeps references of an unknown type or to a missing block as text', () => {
      const rows = propRow('asset', '<div><p><img src="./media_ab12.png"></p></div>');
      const read = (ref) => convertHtmlToJson({ html: assetPage(rows, ref) }).json.data.hero;
      expect(read('self://video#hero-abc')).to.equal('self://video#hero-abc');
      expect(read('self://asset#hero-zzz')).to.equal('self://asset#hero-zzz');
    });

    it('reads the asset row of an asset block and skips other properties', () => {
      const rows = propRow('alt', '<div><p>Portrait of Ada</p></div>')
        + propRow('asset', '<div><p><img src="./media_ab12.png"></p></div>')
        + propRow('title', '<div><p>Ada</p></div>');
      expect(convertHtmlToJson({ html: assetPage(rows) }).json.data.hero).to.equal('./media_ab12.png');
    });

    it('reads an asset block without an asset row as an empty asset', () => {
      const rows = propRow('alt', '<div><p>Portrait of Ada</p></div>');
      expect(convertHtmlToJson({ html: assetPage(rows) }).json.data.hero).to.equal('');
    });

    it('reads an asset block as its value, not as an object', () => {
      expect(readAsset('<div><p><img src="./media_ab12.png?width=750"></p></div>'))
        .to.equal('./media_ab12.png');
    });

    it('reads a link in an asset block as its target, whatever its text', () => {
      expect(readAsset(`<div><p><a href="${files.pdf}">Datasheet</a></p></div>`)).to.equal(files.pdf);
      expect(readAsset(`<div><p><a href=" ${files.video} ">${files.video}</a></p></div>`))
        .to.equal(files.video);
    });

    it('reads an image in an asset block even next to text', () => {
      expect(readAsset('<div><p>caption</p><p><img src="./media_ab12.png"></p></div>'))
        .to.equal('./media_ab12.png');
    });

    it('reads an asset block without an image or link as its text', () => {
      expect(readAsset('<div><p> ./media_ab12.png </p></div>')).to.equal('./media_ab12.png');
      expect(readAsset('<div></div>')).to.equal('');
    });

    it('resolves media bus images and links in asset blocks against asset.base', () => {
      const asset = { base: 'https://main--site--org.aem.page/players/ada' };
      expect(readAsset('<div><picture><img src="./media_ab12.png?width=750"></picture></div>', asset))
        .to.equal('https://main--site--org.aem.page/players/media_ab12.png');
      expect(readAsset('<div><p><a href="./media_cd34.mp4">video</a></p></div>', asset))
        .to.equal('https://main--site--org.aem.page/players/media_cd34.mp4');
      expect(readAsset(`<div><p><a href="${files.pdf}">pdf</a></p></div>`, asset)).to.equal(files.pdf);
    });

    it('reads asset blocks referenced from list items', () => {
      const html = `<body><main><div>
        <div class="da-form"><div><div>x-schema-name</div><div>player</div></div></div>
        <div class="player"><div><div>gallery</div><div><ul><li>self://asset#gallery-a1</li><li>self://asset#gallery-b2</li></ul></div></div></div>
        <div class="gallery gallery-a1"><div><div>asset</div><div><p><img src="./media_ab12.png"></p></div></div></div>
        <div class="gallery gallery-b2"><div><div>asset</div><div><p><a href="${files.pdf}">${files.pdf}</a></p></div></div></div>
      </div></main></body>`;
      expect(convertHtmlToJson({ html }).json.data.gallery)
        .to.deep.equal(['./media_ab12.png', files.pdf]);
    });

    it('reads back every asset it writes', () => {
      const json = doc({
        hero: sources.smartCrop,
        gallery: [sources.publish, files.video, sources.hlx6],
        sponsor: { logo: sources.upload, name: 'Acme' },
        chapters: [{ title: 'One', slides: [files.audio, sources.upload] }],
      });
      expect(convertHtmlToJson({ html: save({ json, schema }).html }).json).to.deep.equal(json);
    });
  });

  describe('reading', () => {
    it('reads a media bus image from EDS picture markup without rendition parameters', () => {
      const cell = `<div><picture>
        <source type="image/webp" srcset="./media_1c0072.jpg?width=2000&#x26;format=webply&#x26;optimize=medium" media="(min-width: 600px)">
        <img loading="lazy" alt="" src="./media_1c0072.jpg?width=750&#x26;format=jpg&#x26;optimize=medium" width="1620" height="1080">
      </picture></div>`;
      expect(readHero(cell)).to.equal('./media_1c0072.jpg');
    });

    it('drops a fragment from media bus paths', () => {
      expect(readHero('<div><p><img src="./media_ab12.png#width=800&amp;height=600"></p></div>'))
        .to.equal('./media_ab12.png');
    });

    it('drops rendition parameters from bare media bus paths', () => {
      expect(readHero('<div><p><img src="media_ab12.png?width=750"></p></div>'))
        .to.equal('media_ab12.png');
    });

    it('keeps the query of images outside the media bus', () => {
      const cell = `<div><p><img src="${sources.smartCrop.replace(/&/g, '&amp;')}" alt=""></p></div>`;
      expect(readHero(cell)).to.equal(sources.smartCrop);
      expect(readHero('<div><p><img src="./media_logo.png?width=750"></p></div>'))
        .to.equal('./media_logo.png?width=750');
      expect(readHero('<div><p><img src="https://main--site--org.aem.live/media_ab12.png?width=750"></p></div>'))
        .to.equal('https://main--site--org.aem.live/media_ab12.png?width=750');
    });

    it('trims the image source like text values', () => {
      expect(readHero('<div><p><img src="  ./media_ab12.png  "></p></div>')).to.equal('./media_ab12.png');
    });

    it('reads images inside list items', () => {
      const cell = '<div><ul><li><picture><img src="./media_ab12.png?width=750"></picture></li><li>text</li></ul></div>';
      expect(readHero(cell)).to.deep.equal(['./media_ab12.png', 'text']);
    });

    it('keeps text when a cell holds both text and an image', () => {
      expect(readHero('<div><p>caption</p><p><img src="./media_ab12.png"></p></div>')).to.equal('caption');
    });

    it('keeps a reference when a list item holds both a reference and an image', () => {
      const html = `<body><main><div>
        <div class="da-form"><div><div>x-schema-name</div><div>player</div></div></div>
        <div class="player"><div><div>hero</div><div><ul><li><img src="./media_ab12.png">self://#hero-abc</li></ul></div></div></div>
        <div class="hero hero-abc"><div><div>name</div><div>Ada</div></div></div>
      </div></main></body>`;
      expect(convertHtmlToJson({ html }).json.data.hero).to.deep.equal([{ name: 'Ada' }]);
    });

    it('reads the first usable image and skips images without a source', () => {
      expect(readHero('<div><p><img alt="none"><img src=""><img src="./media_aa.png"><img src="./media_bb.png"></p></div>'))
        .to.equal('./media_aa.png');
    });

    it('reads a cell without a usable image as empty text', () => {
      expect(readHero('<div><p><img src="   "></p></div>')).to.equal('');
      expect(readHero('<div><picture><source srcset="./media_aa.png"></picture></div>')).to.equal('');
    });

    it('never coerces an image source into a number or boolean', () => {
      expect(readHero('<div><p><img src="123"></p></div>')).to.equal('123');
      expect(readHero('<div><p><img src="true"></p></div>')).to.equal('true');
    });

    it('keeps about:error from a failed media bus copy visible', () => {
      const cell = '<div><p><img src="about:error" alt=""></p></div>';
      expect(readHero(cell)).to.equal('about:error');
      const withBase = convertHtmlToJson({
        html: page(cell),
        asset: { base: 'https://main--site--org.aem.page/players/ada' },
      });
      expect(withBase.json.data.hero).to.equal('about:error');
    });

    it('reads the first of several pictures', () => {
      const cell = `<div>
        <p><picture><img src="./media_aa.png?width=750"></picture></p>
        <p><picture><img src="./media_bb.png?width=750"></picture></p>
      </div>`;
      expect(readHero(cell)).to.equal('./media_aa.png');
    });

    it('reads a linked image as its source', () => {
      const cell = '<div><p><a href="https://x.test/page"><img src="./media_ab12.png"></a></p></div>';
      expect(readHero(cell)).to.equal('./media_ab12.png');
    });

    it('reads an image next to empty paragraphs and non-breaking spaces', () => {
      const cell = `<div>
        <p>&nbsp;</p>
        <p><picture><img src="./media_ab12.png?width=750"></picture></p>
        <p>  </p>
      </div>`;
      expect(readHero(cell)).to.equal('./media_ab12.png');
    });

    it('reads a link with other text as that text', () => {
      expect(readHero(`<div><p><a href="${files.pdf}">Datasheet</a></p></div>`)).to.equal('Datasheet');
    });

    it('never reads an image from a nested block into the cell that references it', () => {
      const html = `<body><main><div>
        <div class="da-form"><div><div>x-schema-name</div><div>player</div></div></div>
        <div class="player">
          <div><div>sponsor</div><div><p>self://#sponsor-abc</p></div></div>
          <div><div>hero</div><div></div></div>
        </div>
        <div class="sponsor sponsor-abc"><div><div>logo</div><div><p><img src="./media_ab12.png"></p></div></div></div>
      </div></main></body>`;
      expect(convertHtmlToJson({ html }).json.data).to.deep.equal({
        sponsor: { logo: './media_ab12.png' },
        hero: '',
      });
    });

    it('writes a value stored as text by earlier versions as an image on the next save', () => {
      const legacy = readHero(`<div><p>${sources.upload}</p></div>`);
      expect(legacy).to.equal(sources.upload);
      expect(imageSources(writeHero(legacy, schema))).to.deep.equal([sources.upload]);
    });

    describe('with asset.base', () => {
      const origin = 'https://main--site--org.aem.page';
      const pageHref = `${origin}/players/ada`;
      const readWithBase = (cell, base = pageHref) => convertHtmlToJson({
        html: page(cell),
        asset: { base },
      });

      it('resolves media bus images against the page like a browser', () => {
        const cell = '<div><picture><img src="./media_1c0072.jpg?width=750&amp;format=jpg"></picture></div>';
        expect(readWithBase(cell).json.data.hero).to.equal(`${origin}/players/media_1c0072.jpg`);
        expect(readWithBase('<div><p><img src="media_ab12.png"></p></div>').json.data.hero)
          .to.equal(`${origin}/players/media_ab12.png`);
      });

      it('resolves media bus images in list items', () => {
        const cell = '<div><ul><li><picture><img src="./media_ab12.png?width=750"></picture></li></ul></div>';
        expect(readWithBase(cell).json.data.hero).to.deep.equal([`${origin}/players/media_ab12.png`]);
      });

      it('resolves against folder pages, root pages, and pages with a query or fragment', () => {
        const cell = '<div><p><img src="./media_ab12.png"></p></div>';
        expect(readWithBase(cell, `${origin}/players/`).json.data.hero)
          .to.equal(`${origin}/players/media_ab12.png`);
        expect(readWithBase(cell, `${origin}/`).json.data.hero).to.equal(`${origin}/media_ab12.png`);
        expect(readWithBase(cell, origin).json.data.hero).to.equal(`${origin}/media_ab12.png`);
        expect(readWithBase(cell, `${pageHref}?x=1#top`).json.data.hero)
          .to.equal(`${origin}/players/media_ab12.png`);
      });

      it('keeps other image URLs, links and text unchanged', () => {
        expect(readWithBase(`<div><p><img src="${sources.publish}"></p></div>`).json.data.hero)
          .to.equal(sources.publish);
        expect(readWithBase(`<div><p><a href="${files.pdf}">${files.pdf}</a></p></div>`).json.data.hero)
          .to.equal(files.pdf);
        expect(readWithBase('<div><p>./media_ab12.png</p></div>').json.data.hero)
          .to.equal('./media_ab12.png');
      });

      it('returns an error for a base that is not an absolute http or https URL', () => {
        ['site.aem.page', '/players', 'ftp://x.test', ''].forEach((invalid) => {
          expect(readWithBase('<div><p>x</p></div>', invalid).error, invalid)
            .to.equal('asset.base must be an absolute http or https URL.');
        });
      });

      it('keeps relative media bus paths without a base', () => {
        expect(readHero('<div><p><img src="./media_ab12.png"></p></div>')).to.equal('./media_ab12.png');
      });
    });
  });

  describe('round trip', () => {
    Object.entries(sources).forEach(([name, href]) => {
      it(`returns the stored ${name} URL in fields and array items`, () => {
        const data = { hero: href, gallery: [href], sponsor: { logo: href } };
        [schema, undefined].forEach((withSchema) => {
          const { html } = save({ json: doc(data), schema: withSchema });
          const { json } = convertHtmlToJson({ html });
          expect(json.data).to.deep.equal(data);
        });
      });
    });

    it('trims a padded media value the same way with and without a model', () => {
      [schema, undefined].forEach((withSchema) => {
        const { html } = save({ json: doc({ hero: `  ${sources.upload} ` }), schema: withSchema });
        expect(convertHtmlToJson({ html }).json.data.hero).to.equal(sources.upload);
      });
    });

    it('stores a media bus value with rendition parameters once, then keeps it stable', () => {
      const first = save({ json: doc({ hero: './media_ab12.png?width=750' }), schema }).html;
      const stored = convertHtmlToJson({ html: first }).json.data.hero;
      expect(stored).to.equal('./media_ab12.png');

      const second = save({ json: doc({ hero: stored }), schema }).html;
      expect(convertHtmlToJson({ html: second }).json.data.hero).to.equal(stored);
    });

    it('returns file URLs unchanged', () => {
      const data = {
        hero: files.pdf,
        gallery: [files.video, sources.publish],
        sponsor: { logo: files.audio },
      };
      const { html } = save({ json: doc(data), schema });
      expect(convertHtmlToJson({ html }).json.data).to.deep.equal(data);
    });
  });
});

describe('media files', () => {
  const links = (html) => [...parse(html).querySelectorAll('a')]
    .map((link) => [link.getAttribute('href'), link.textContent]);

  it('writes non-image files as links with the URL as text', () => {
    const { html } = save({
      json: doc({ hero: files.pdf, gallery: [files.video, sources.upload] }),
      schema,
    });
    expect(links(html)).to.deep.equal([[files.pdf, files.pdf], [files.video, files.video]]);
    expect(imageSources(html)).to.deep.equal([sources.upload]);
  });

  it('writes a value without an extension as a link and reads it back unchanged', () => {
    const external = 'https://images.example.com/photo-1609432638531?auto=format&w=750';
    const { html } = save({ json: doc({ hero: external }), schema });
    expect(imageSources(html)).to.deep.equal([]);
    expect(links(html)).to.deep.equal([[external, external]]);
    expect(convertHtmlToJson({ html }).json.data.hero).to.equal(external);
  });

  it('escapes link URLs in the attribute and the text', () => {
    const href = 'https://x.test/a.pdf?a=1&b="<2>"';
    const { html } = save({ json: doc({ hero: href }), schema });
    expect(html).to.include('<a href="https://x.test/a.pdf?a=1&amp;b=&quot;<2>&quot;">');
    expect(html).to.include('>https://x.test/a.pdf?a=1&amp;b="&lt;2&gt;"</a>');
    expect(convertHtmlToJson({ html }).json.data.hero).to.equal(href);
  });
});

describe('isIngestedImage', () => {
  it('accepts media bus images and images uploaded to DA', () => {
    [sources.upload, sources.hlx6, 'media_ab12.png', 'https://stage-content.da.live/o/s/a.JPG']
      .forEach((src) => expect(isIngestedImage(src), src).to.equal(true));
  });

  it('rejects images from other hosts and files on DA', () => {
    [
      sources.publish,
      sources.smartCrop,
      'http://content.da.live/o/s/a.png',
      'https://content.da.live.example.com/a.png',
      'https://content.da.live/o/s/a.pdf',
      './media_ab12.mp4',
      'https://main--site--org.aem.live/media_ab12.png',
    ].forEach((src) => expect(isIngestedImage(src), src).to.equal(false));
  });
});

describe('isMediaImage', () => {
  it('treats the formats the media bus delivers as images, in any case', () => {
    ['a.jpg', 'b.JPEG', 'c.png', 'd.gif', 'e.webp', 'f.AVIF', 'g.svg'].forEach((name) => {
      expect(isMediaImage(`https://x.test/dam/${name}`), name).to.equal(true);
    });
  });

  it('treats every other extension as a file', () => {
    ['a.pdf', 'b.DOCX', 'c.mp4', 'd.mp3', 'e.zip', 'f.psd', 'g.tif', 'h.heic'].forEach((name) => {
      expect(isMediaImage(`https://x.test/dam/${name}`), name).to.equal(false);
    });
  });

  it('treats the AEM Assets video rendition as a file', () => {
    expect(isMediaImage(files.video)).to.equal(false);
    expect(isMediaImage(`${files.video}?autoplay=1`)).to.equal(false);
  });

  it('treats values without an extension as files, so they are never saved as broken images', () => {
    [
      'https://images.unsplash.com/photo-1609432638531?auto=format&w=750',
      'https://x.test/display',
      'https://x.test/folder/',
      'https://x.test',
      'https://x.test/archive.v2/download',
    ].forEach((src) => expect(isMediaImage(src), src).to.equal(false));
  });

  it('treats AEM smart crop and Dynamic Media renditions with an image extension as images', () => {
    expect(isMediaImage(sources.smartCrop)).to.equal(true);
  });

  it('judges only the path, not the query or fragment', () => {
    expect(isMediaImage('https://x.test/a.png?download=report.pdf')).to.equal(true);
    expect(isMediaImage('https://x.test/a.pdf#page=2')).to.equal(false);
    expect(isMediaImage('  https://x.test/a.pdf  ')).to.equal(false);
  });

  it('returns false for values that are not strings', () => {
    [undefined, null, 5, {}].forEach((value) => {
      expect(isMediaImage(value)).to.equal(false);
    });
  });
});
