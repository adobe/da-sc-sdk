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
import { convertJsonToHtml } from '../../src/html/json2html.js';
import { normalizeMediaSource } from '../../src/types/media.js';
import file from '../../src/types/shared/file/1.0.0.js';
import image from '../../src/types/shared/image/1.0.0.js';
import { modelOf, prune, save } from './test-utils.js';

const schema = {
  type: 'object',
  properties: {
    hero: { $ref: image.$id, title: 'Hero' },
    datasheet: { $ref: file.$id, title: 'Datasheet' },
    caption: { type: 'string' },
    gallery: { type: 'array', items: { $ref: image.$id, title: 'Photo' } },
    sponsor: { type: 'object', properties: { logo: { $ref: image.$id, title: 'Logo' } } },
  },
};

const sources = {
  mediaBus: './media_1a2b3c.png',
  upload: 'https://content.da.live/org/site/hero.png',
  pdf: 'https://example.com/content/dam/site/datasheet.pdf',
  video: 'https://example.com/adobe/assets/urn:aaid:aem:2/play',
};

const doc = (data) => ({ metadata: { schemaName: 'product' }, data });

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

const images = (html) => [...parse(html).querySelectorAll('img')]
  .map((img) => ({ src: img.getAttribute('src'), alt: img.getAttribute('alt') }));

const links = (html) => [...parse(html).querySelectorAll('a')]
  .map((link) => ({ href: link.getAttribute('href'), text: link.textContent }));

const write = (data) => save({ json: doc(data), schema });

// A page whose data block has one row with the given key and value cell.
const page = ({ key = 'src', cell }) => `<body><main><div>
  <div class="da-form"><div><div><h3>x-schema-name</h3></div><div><p>product</p></div></div></div>
  <div class="product"><div><div><h3>${key}</h3></div>${cell}</div></div>
</div></main></body>`;

const read = ({ key = 'src', cell }) => convertHtmlToJson({ html: page({ key, cell }) }).json.data[key];

describe('media fields', () => {
  describe('writing', () => {
    it('writes an image as an image with its alt text, escaped', () => {
      const { html } = write({ hero: { src: sources.upload, alt: 'A "bold" <hero> & more' } });
      expect(images(html)).to.deep.equal([{ src: sources.upload, alt: 'A "bold" <hero> & more' }]);
      expect(html).to.include('alt="A &quot;bold&quot; &lt;hero&gt; &amp; more"');
    });

    it('writes an image without alt text with an empty alt', () => {
      [undefined, ' '].forEach((alt) => {
        const { html } = write({ hero: { src: sources.mediaBus, alt } });
        expect(images(html), String(alt)).to.deep.equal([{ src: sources.mediaBus, alt: '' }]);
      });
    });

    it('writes a file, and an image field that holds another file, as a link', () => {
      const { html } = write({
        hero: { src: sources.pdf },
        datasheet: { src: sources.upload },
      });
      expect(images(html)).to.deep.equal([]);
      expect(links(html)).to.deep.equal([
        { href: sources.pdf, text: sources.pdf },
        { href: sources.upload, text: sources.upload },
      ]);
    });

    it('judges an image file by the extension of its path, in any case', () => {
      const imageSources = [
        './media_ab12.PNG',
        'https://example.com/a/hero.webp?width=750',
        'https://example.com/logo.svg#icon',
      ];
      imageSources.forEach((src) => {
        expect(images(write({ hero: { src } }).html), src).to.have.length(1);
      });
      const fileSources = [sources.video, 'https://example.com', 'https://example.com/hero.png/download'];
      fileSources.forEach((src) => {
        expect(links(write({ hero: { src } }).html), src).to.deep.equal([{ href: src, text: src }]);
      });
    });

    it('writes media in array items and nested objects', () => {
      const { html } = write({
        gallery: [{ src: sources.upload }, { src: sources.mediaBus }],
        sponsor: { logo: { src: sources.mediaBus } },
      });
      expect(images(html).map(({ src }) => src))
        .to.have.members([sources.upload, sources.mediaBus, sources.mediaBus]);
    });

    it('writes a media bus path without rendition parameters', () => {
      const { html } = write({ hero: { src: `${sources.mediaBus}?width=750&format=png` } });
      expect(images(html)).to.deep.equal([{ src: sources.mediaBus, alt: '' }]);
    });

    it('writes alt text and other strings as text', () => {
      const { html } = write({ hero: { src: sources.upload, alt: 'Hero' }, caption: sources.upload });
      expect(html).to.include('<p>Hero</p>');
      expect(html).to.include(`<p>${sources.upload}</p>`);
    });

    it('fails on a source that the pattern of its shared schema rejects', () => {
      // eslint-disable-next-line no-script-url
      const scriptUrl = 'javascript:alert(1)';
      [scriptUrl, 'data:image/png;base64,AAAA', '/content/dam/hero.png', 42].forEach((src) => {
        expect(write({ hero: { src } }), String(src)).to.deep.equal({
          error: '/data/hero/src must match the pattern of its shared schema.',
        });
      });
    });

    it('writes exactly the sources the pattern of the shared schema accepts', () => {
      const pattern = new RegExp(image.properties.src.pattern);
      [
        sources.mediaBus, './hero.png', 'media_ab12.jpg', 'http://127.0.0.1:3000/hero.jpg',
        'https://example.com:44300/hero.jpg', 'HTTPS://example.com/hero.jpg', '//evil.example/x.png',
      ].forEach((src) => {
        expect('html' in write({ hero: { src } }), src).to.equal(pattern.test(src));
      });
    });

    it('never writes a media source whose shared schema has no pattern', () => {
      const model = modelOf(schema, doc({ hero: { src: sources.mediaBus } }));
      delete model.byPointer['/data/hero/src'].validation.pattern;
      expect(convertJsonToHtml({ json: model.document, model })).to.deep.equal({
        error: '/data/hero/src must match the pattern of its shared schema.',
      });
    });

    it('names the pointer of an invalid source in an array item', () => {
      const { error } = write({ gallery: [{ src: sources.upload }, { src: 'data:,x' }] });
      expect(error).to.include('/data/gallery/1/src');
    });

    describe('with config.externalImagesAsLinks', () => {
      const writeWithConfig = (data, config) => {
        const model = modelOf(schema, doc(data));
        return convertJsonToHtml({ json: model.document, model, config });
      };

      it('writes images from other hosts as links', () => {
        const src = 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/as/hero.png';
        const { html } = writeWithConfig({ hero: { src } }, { externalImagesAsLinks: true });
        expect(images(html)).to.deep.equal([]);
        expect(links(html)).to.deep.equal([{ href: src, text: src }]);
      });

      it('keeps media bus images and DA uploads as images', () => {
        const data = { gallery: [{ src: sources.mediaBus }, { src: sources.upload }] };
        const { html } = writeWithConfig(data, { externalImagesAsLinks: true });
        expect(images(html).map(({ src }) => src))
          .to.deep.equal([sources.mediaBus, sources.upload]);
      });

      it('writes images from any host as images when it is false, empty or null', () => {
        const src = 'https://example.com/content/dam/site/hero.png';
        [{ externalImagesAsLinks: false }, {}, null].forEach((config) => {
          const { html } = writeWithConfig({ hero: { src } }, config);
          expect(images(html), JSON.stringify(config)).to.have.length(1);
        });
      });

      it('fails on a config that is not an object or a flag that is not a boolean', () => {
        expect(writeWithConfig({}, 'links')).to.deep.equal({ error: 'config must be an object.' });
        expect(writeWithConfig({}, { externalImagesAsLinks: 'yes' }))
          .to.deep.equal({ error: 'config.externalImagesAsLinks must be a boolean.' });
      });
    });

    it('writes media as text without a model', () => {
      // eslint-disable-next-line no-script-url
      const scriptUrl = 'javascript:alert(1)';
      const { html } = convertJsonToHtml({ json: doc({ hero: { src: scriptUrl } }) });
      expect(images(html)).to.deep.equal([]);
      expect(links(html)).to.deep.equal([]);
      expect(html).to.include(`<p>${scriptUrl}</p>`);
    });
  });

  describe('reading', () => {
    it('reads an image as its source, without rendition parameters', () => {
      const cell = `<div><picture>
        <source type="image/webp" srcset="${sources.mediaBus}?width=2000&format=webply">
        <img loading="lazy" alt="" src="${sources.mediaBus}?width=750&format=png&optimize=medium">
      </picture></div>`;
      expect(read({ cell })).to.equal(sources.mediaBus);
    });

    it('reads a link as its URL', () => {
      expect(read({ cell: `<div><p><a href="${sources.pdf}">${sources.pdf}</a></p></div>` }))
        .to.equal(sources.pdf);
    });

    it('reads the first image with a source', () => {
      const cell = `<div><img src=" "><img src="${sources.upload}"><img src="${sources.pdf}"></div>`;
      expect(read({ cell })).to.equal(sources.upload);
    });

    it('keeps text over an image, and never reads an image source as a number', () => {
      expect(read({ cell: `<div><p>text</p><img src="${sources.upload}"></div>` })).to.equal('text');
      expect(read({ cell: '<div><img src="42"></div>' })).to.equal('42');
    });

    it('reads an empty source cell, and an image outside a source cell, as empty', () => {
      expect(read({ cell: '<div><img alt="none"></div>' })).to.equal('');
      expect(read({ key: 'caption', cell: `<div><img src="${sources.upload}"></div>` })).to.equal('');
    });
  });

  it('reads back every media value it writes', () => {
    const data = {
      hero: { src: sources.mediaBus, alt: 'Hero' },
      datasheet: { src: sources.video },
      gallery: [{ src: sources.upload }, { src: sources.pdf, alt: 'Specs' }],
      sponsor: { logo: { src: sources.upload } },
    };
    const { html } = save({ json: doc(data), schema });
    expect(convertHtmlToJson({ html }).json.data).to.deep.equal(prune(data));
  });
});

describe('normalizeMediaSource', () => {
  it('trims a source and drops the rendition parameters of a media bus path', () => {
    expect(normalizeMediaSource(' ./media_ab12.jpg?width=750#top ')).to.equal('./media_ab12.jpg');
    expect(normalizeMediaSource(' https://example.com/hero.jpg?width=750 '))
      .to.equal('https://example.com/hero.jpg?width=750');
  });
});
