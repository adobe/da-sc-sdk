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
import { media as mediaHelpers } from '../../src/index.js';

const media = (title) => ({ type: 'string', title, 'x-semantic-type': 'media' });

const schema = {
  type: 'object',
  properties: {
    hero: media('Hero'),
    caption: { type: 'string' },
    gallery: { type: 'array', items: media('Photo') },
    sponsor: { type: 'object', properties: { logo: media('Logo'), name: { type: 'string' } } },
    chapters: {
      type: 'array',
      items: { type: 'object', properties: { slides: { type: 'array', items: media('Slide') } } },
    },
    fit: { type: 'string', enum: ['cover'], 'x-semantic-type': 'media' },
    day: { type: 'string', format: 'date', 'x-semantic-type': 'media' },
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

const writeHero = (value, withSchema) => convertJsonToHtml({
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
      const { html } = convertJsonToHtml({
        json: doc({ hero: sources.upload, caption: sources.upload }),
        schema,
      });
      expect(imageSources(html)).to.deep.equal([sources.upload]);
      expect(parse(html).querySelector('img').getAttribute('alt')).to.equal('');
      expect(html).to.include(`<p>${sources.upload}</p>`);
    });

    it('writes media in array items, nested objects and nested arrays', () => {
      const { html } = convertJsonToHtml({
        json: doc({
          gallery: [sources.publish, sources.hlx6],
          sponsor: { logo: sources.upload, name: 'Acme' },
          chapters: [{ slides: [sources.smartCrop] }],
        }),
        schema,
      });
      expect(imageSources(html)).to.have.members([
        sources.publish, sources.hlx6, sources.upload, sources.smartCrop,
      ]);
      expect(html).to.include('<p>Acme</p>');
    });

    it('writes media items of a root array and of arrays of arrays', () => {
      const rootArray = convertJsonToHtml({
        json: doc([sources.upload]),
        schema: { type: 'array', items: media('Photo') },
      }).html;
      expect(imageSources(rootArray)).to.deep.equal([sources.upload]);

      const nested = convertJsonToHtml({
        json: doc({ grid: [[sources.publish]] }),
        schema: {
          type: 'object',
          properties: { grid: { type: 'array', items: { type: 'array', items: media('Cell') } } },
        },
      }).html;
      expect(imageSources(nested)).to.deep.equal([sources.publish]);
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

    it('lets enum and date formats take precedence over the media hint', () => {
      const { html } = convertJsonToHtml({ json: doc({ fit: 'cover', day: '2026-01-01' }), schema });
      expect(html).to.not.include('<img');
    });

    it('stores media bus paths without rendition parameters and trims sources', () => {
      expect(imageSources(writeHero(' ./media_ab12.png?width=750#width=800 ', schema)))
        .to.deep.equal(['./media_ab12.png']);
      expect(imageSources(writeHero(` ${sources.smartCrop} `, schema)))
        .to.deep.equal([sources.smartCrop]);
    });

    it('writes non-string values of a media field as text', () => {
      const html = writeHero(5, schema);
      expect(html).to.not.include('<img');
      expect(html).to.include('<p>5</p>');
    });

    it('writes data that does not match the schema as text', () => {
      const { html } = convertJsonToHtml({ json: doc({ hero: { url: sources.upload } }), schema });
      expect(html).to.not.include('<img');
    });

    it('falls back to text for missing, invalid or unsupported schemas', () => {
      const textOnly = convertJsonToHtml({ json: doc({ hero: sources.upload }) }).html;
      [
        undefined, null, 'schema', 42, [], {}, { type: 'string' },
        { oneOf: [media('A'), media('B')] },
        { type: 'object', required: 5, properties: { hero: media('Hero') } },
      ].forEach((invalid) => {
        const { html } = convertJsonToHtml({
          json: doc({ hero: sources.upload }),
          schema: invalid,
        });
        expect(html).to.equal(textOnly);
      });
    });

    it('writes the same HTML as before when no schema is given', () => {
      const json = doc({ hero: sources.upload, gallery: [sources.publish] });
      expect(convertJsonToHtml({ json }).html).to.equal('<body><header></header><main><div>'
        + '<div class="da-form"><div><div><h3>x-schema-name</h3></div><div><p>player</p></div></div></div>'
        + '<div class="player">'
        + `<div><div><h3>hero</h3></div><div><p>${sources.upload}</p></div></div>`
        + `<div><div><h3>gallery</h3></div><div><ul><li>${sources.publish}</li></ul></div></div>`
        + '</div></div></main><footer></footer></body>');
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

    describe('with media.origin', () => {
      const origin = 'https://main--site--org.aem.page';
      const readWithOrigin = (cell, mediaOrigin = origin) => convertHtmlToJson({
        html: page(cell),
        media: { origin: mediaOrigin },
      });

      it('returns media bus images as absolute URLs on the origin', () => {
        const cell = '<div><picture><img src="./media_1c0072.jpg?width=750&amp;format=jpg"></picture></div>';
        expect(readWithOrigin(cell).json.data.hero).to.equal(`${origin}/media_1c0072.jpg`);
        expect(readWithOrigin('<div><p><img src="media_ab12.png"></p></div>').json.data.hero)
          .to.equal(`${origin}/media_ab12.png`);
      });

      it('resolves media bus images in list items', () => {
        const cell = '<div><ul><li><picture><img src="./media_ab12.png?width=750"></picture></li></ul></div>';
        expect(readWithOrigin(cell).json.data.hero).to.deep.equal([`${origin}/media_ab12.png`]);
      });

      it('uses only the origin of the given URL', () => {
        const cell = '<div><p><img src="./media_ab12.png"></p></div>';
        expect(readWithOrigin(cell, `${origin}/articles/example?x=1`).json.data.hero)
          .to.equal(`${origin}/media_ab12.png`);
      });

      it('keeps other image URLs, links and text unchanged', () => {
        expect(readWithOrigin(`<div><p><img src="${sources.publish}"></p></div>`).json.data.hero)
          .to.equal(sources.publish);
        expect(readWithOrigin(`<div><p><a href="${files.pdf}">${files.pdf}</a></p></div>`).json.data.hero)
          .to.equal(files.pdf);
        expect(readWithOrigin('<div><p>./media_ab12.png</p></div>').json.data.hero)
          .to.equal('./media_ab12.png');
      });

      it('returns an error for an origin that is not an absolute http or https URL', () => {
        ['site.aem.page', '/players', 'ftp://x.test', ''].forEach((invalid) => {
          expect(readWithOrigin('<div><p>x</p></div>', invalid).error, invalid)
            .to.equal('media.origin must be an absolute http or https URL.');
        });
      });

      it('keeps relative media bus paths without an origin', () => {
        expect(readHero('<div><p><img src="./media_ab12.png"></p></div>')).to.equal('./media_ab12.png');
      });
    });
  });

  describe('round trip', () => {
    Object.entries(sources).forEach(([name, href]) => {
      it(`returns the stored ${name} URL in fields and array items`, () => {
        const data = { hero: href, gallery: [href], sponsor: { logo: href } };
        [schema, undefined].forEach((withSchema) => {
          const { html } = convertJsonToHtml({ json: doc(data), schema: withSchema });
          const { json } = convertHtmlToJson({ html });
          expect(json.data).to.deep.equal(data);
        });
      });
    });

    it('trims a padded media value the same way with and without a schema', () => {
      [schema, undefined].forEach((withSchema) => {
        const { html } = convertJsonToHtml({ json: doc({ hero: `  ${sources.upload} ` }), schema: withSchema });
        expect(convertHtmlToJson({ html }).json.data.hero).to.equal(sources.upload);
      });
    });

    it('stores a media bus value with rendition parameters once, then keeps it stable', () => {
      const first = convertJsonToHtml({ json: doc({ hero: './media_ab12.png?width=750' }), schema }).html;
      const stored = convertHtmlToJson({ html: first }).json.data.hero;
      expect(stored).to.equal('./media_ab12.png');

      const second = convertJsonToHtml({ json: doc({ hero: stored }), schema }).html;
      expect(convertHtmlToJson({ html: second }).json.data.hero).to.equal(stored);
    });

    it('returns file URLs unchanged', () => {
      const data = {
        hero: files.pdf,
        gallery: [files.video, sources.publish],
        sponsor: { logo: files.audio },
      };
      const { html } = convertJsonToHtml({ json: doc(data), schema });
      expect(convertHtmlToJson({ html }).json.data).to.deep.equal(data);
    });
  });
});

describe('media files', () => {
  const links = (html) => [...parse(html).querySelectorAll('a')]
    .map((link) => [link.getAttribute('href'), link.textContent]);

  it('writes non-image files as links with the URL as text', () => {
    const { html } = convertJsonToHtml({
      json: doc({ hero: files.pdf, gallery: [files.video, sources.upload] }),
      schema,
    });
    expect(links(html)).to.deep.equal([[files.pdf, files.pdf], [files.video, files.video]]);
    expect(imageSources(html)).to.deep.equal([sources.upload]);
  });

  it('writes a value without an extension as a link and reads it back unchanged', () => {
    const external = 'https://images.example.com/photo-1609432638531?auto=format&w=750';
    const { html } = convertJsonToHtml({ json: doc({ hero: external }), schema });
    expect(imageSources(html)).to.deep.equal([]);
    expect(links(html)).to.deep.equal([[external, external]]);
    expect(convertHtmlToJson({ html }).json.data.hero).to.equal(external);
  });

  it('escapes link URLs in the attribute and the text', () => {
    const href = 'https://x.test/a.pdf?a=1&b="<2>"';
    const { html } = convertJsonToHtml({ json: doc({ hero: href }), schema });
    expect(html).to.include('<a href="https://x.test/a.pdf?a=1&amp;b=&quot;<2>&quot;">');
    expect(html).to.include('>https://x.test/a.pdf?a=1&amp;b="&lt;2&gt;"</a>');
    expect(convertHtmlToJson({ html }).json.data.hero).to.equal(href);
  });
});

describe('media.isImage', () => {
  it('treats the formats the media bus delivers as images, in any case', () => {
    ['a.jpg', 'b.JPEG', 'c.png', 'd.gif', 'e.webp', 'f.AVIF', 'g.svg'].forEach((name) => {
      expect(mediaHelpers.isImage(`https://x.test/dam/${name}`), name).to.equal(true);
    });
  });

  it('treats every other extension as a file', () => {
    ['a.pdf', 'b.DOCX', 'c.mp4', 'd.mp3', 'e.zip', 'f.psd', 'g.tif', 'h.heic'].forEach((name) => {
      expect(mediaHelpers.isImage(`https://x.test/dam/${name}`), name).to.equal(false);
    });
  });

  it('treats the AEM Assets video rendition as a file', () => {
    expect(mediaHelpers.isImage(files.video)).to.equal(false);
    expect(mediaHelpers.isImage(`${files.video}?autoplay=1`)).to.equal(false);
  });

  it('treats values without an extension as files, so they are never saved as broken images', () => {
    [
      'https://images.unsplash.com/photo-1609432638531?auto=format&w=750',
      'https://x.test/display',
      'https://x.test/folder/',
      'https://x.test',
      'https://x.test/archive.v2/download',
    ].forEach((src) => expect(mediaHelpers.isImage(src), src).to.equal(false));
  });

  it('treats AEM smart crop and Dynamic Media renditions with an image extension as images', () => {
    expect(mediaHelpers.isImage(sources.smartCrop)).to.equal(true);
  });

  it('judges only the path, not the query or fragment', () => {
    expect(mediaHelpers.isImage('https://x.test/a.png?download=report.pdf')).to.equal(true);
    expect(mediaHelpers.isImage('https://x.test/a.pdf#page=2')).to.equal(false);
    expect(mediaHelpers.isImage('  https://x.test/a.pdf  ')).to.equal(false);
  });

  it('returns false for values that are not strings', () => {
    [undefined, null, 5, {}].forEach((value) => {
      expect(mediaHelpers.isImage(value)).to.equal(false);
    });
  });
});
