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
import { executeServerCommand } from '@web/test-runner-commands';
import {
  ORIGIN, SHARED_SCHEMAS, findSharedSchemaById, findSharedSchemaByPath, registerSharedSchemas,
  compareSharedSchemaVersions, findSharedSchemas, getNewestVersions, parseSharedSchemaName,
} from '../../src/types/index.js';

function expectDeepFrozen(value, at) {
  expect(Object.isFrozen(value), at).to.equal(true);
  Object.entries(value)
    .filter(([, child]) => child && typeof child === 'object')
    .forEach(([key, child]) => expectDeepFrozen(child, `${at}/${key}`));
}

describe('shared schemas', () => {
  it('registers every version module in src/types/shared/', async () => {
    const paths = await executeServerCommand('list-shared-schema-modules');
    expect(paths).to.have.lengthOf(SHARED_SCHEMAS.length);
    const modules = await Promise.all(paths.map((path) => import(path)));
    modules.forEach(({ default: schema }, index) => {
      expect(SHARED_SCHEMAS, paths[index]).to.include(schema);
    });
  });

  it('declares JSON Schema 2020-12 and freezes every object', () => {
    expect(Object.isFrozen(SHARED_SCHEMAS)).to.equal(true);
    SHARED_SCHEMAS.forEach((schema) => {
      expect(schema.$schema).to.equal('https://json-schema.org/draft/2020-12/schema');
      expectDeepFrozen(schema, schema.$id);
    });
  });

  it('defines an image as src and alt, requires src and allows nothing else', () => {
    const image = findSharedSchemaByPath('/schemas/shared/image/versions/1.0.0');
    expect(Object.keys(image.properties)).to.deep.equal(['src', 'alt']);
    expect(image.required).to.deep.equal(['src']);
    expect(image.additionalProperties).to.equal(false);
  });

  it('defines a file as src only, requires it and allows nothing else', () => {
    const file = findSharedSchemaByPath('/schemas/shared/file/versions/1.0.0');
    expect(Object.keys(file.properties)).to.deep.equal(['src']);
    expect(file.required).to.deep.equal(['src']);
    expect(file.additionalProperties).to.equal(false);
  });

  // eslint-disable-next-line no-script-url
  const scriptUrl = 'javascript:alert(1)';
  const srcPatterns = () => SHARED_SCHEMAS
    .map(({ $id, properties }) => [$id, new RegExp(properties.src.pattern)]);

  it('accepts a media bus path or an http(s) URL with a host as src', () => {
    const valid = [
      './media_1a2b3c.png',
      './media_ab12.jpg?width=750&format=jpg',
      './media/abc123.jpg',
      'https://main--site--org.aem.page/media_1a2b.png',
      'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/hero.jpg',
      'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/as/hero.avif?width=2000',
      'https://assets.customer-cdn.com/hero.jpg',
      'https://content.da.live/org/site/hero.png',
      'http://localhost:3000/hero.jpg',
      'http://127.0.0.1:3000/hero.jpg',
      'https://[::1]:8443/hero.jpg',
      'https://example.com:44300/hero.jpg',
    ];
    const invalid = [
      '', ' ', 'hero.png', '/content/dam/hero.png', '//evil.example/x.png', 'media_1a2b.jpg',
      scriptUrl, scriptUrl.replace('j', 'J'), scriptUrl.replace(':', '://%0a'),
      'data:image/png;base64,AAAA',
      'vbscript:msgbox(1)', 'file:///etc/passwd', 'blob:https://x/y', 'ftp://example.com/x',
      'https://example.com/a b.png', '\u0001javascript:alert(1)',
      './hero.png', './', './media', './/media_1a2b.jpg', ' ./media_ab12.jpg', './media_ab12.jpg ',
      'https://', 'https:///hero.png', 'https://?x', ' https://example.com/hero.jpg',
    ];
    srcPatterns().forEach(([$id, pattern]) => {
      valid.forEach((src) => expect(pattern.test(src), `${$id} ${src}`).to.equal(true));
      invalid.forEach((src) => expect(pattern.test(src), `${$id} ${src}`).to.equal(false));
    });
  });

  it('accepts no src that resolves to another protocol, or a media bus path on another host', () => {
    const page = new URL('https://main--site--org.aem.page/folder/page');
    const prefixes = ['', ' ', '\t', '\n', '\u0001', '\u0000', ' \u001f'];
    const schemes = ['javascript', 'JavaScript', 'data', 'vbscript', 'file', 'blob', 'http', 'https', 'HTTPS', '', '.'];
    const separators = [':', '://', ':/', '//', '/', ''];
    const payloads = [
      'alert(1)', 'evil.example/x', '//evil.example/x', 'media_1a2b.jpg', '\\evil.example/x', '%0aalert(1)',
      'media//evil.example/x', 'media/../../x', 'media\\evil.example/x',
    ];
    const values = prefixes.flatMap((prefix) => schemes.flatMap((scheme) => separators
      .flatMap((separator) => payloads.map((payload) => `${prefix}${scheme}${separator}${payload}`))));
    expect(values.length).to.be.above(2000);
    srcPatterns().forEach(([$id, pattern]) => {
      values.filter((value) => pattern.test(value)).forEach((value) => {
        let url;
        try {
          url = new URL(value, page);
        } catch {
          return;
        }
        expect(['http:', 'https:'], `${$id} ${JSON.stringify(value)}`).to.include(url.protocol);
        if (value.startsWith('./')) {
          expect(url.host, `${$id} ${JSON.stringify(value)}`).to.equal(page.host);
        }
      });
    });
  });
});

describe('findSharedSchemas', () => {
  it('returns every version, or only those of one shared schema', () => {
    expect(findSharedSchemas()).to.deep.equal(SHARED_SCHEMAS);
    expect(findSharedSchemas({ name: 'image' }).map(({ $id }) => $id))
      .to.deep.equal([`${ORIGIN}/schemas/shared/image/versions/1.0.0`]);
    expect(findSharedSchemas({ name: 'zx9-qk' })).to.deep.equal([]);
  });

  it('returns the newest version of each shared schema', () => {
    expect(findSharedSchemas({ newest: true }).map(({ $id }) => parseSharedSchemaName($id)))
      .to.deep.equal(['image', 'file']);
  });
});

describe('getNewestVersions', () => {
  const schema = (name, version) => ({ $id: `${ORIGIN}/schemas/shared/${name}/versions/${version}` });

  it('keeps the newest version of each shared schema, in the order the names first appear', () => {
    const versions = [
      schema('image', '1.9.0'), schema('file', '1.0.0'), schema('image', '1.10.0'), schema('image', '1.2.0'),
    ];
    expect(getNewestVersions(versions)).to.deep.equal([versions[2], versions[1]]);
  });
});

describe('compareSharedSchemaVersions', () => {
  const schema = (version) => ({ $id: `${ORIGIN}/schemas/shared/image/versions/${version}` });

  it('compares versions numerically', () => {
    expect(compareSharedSchemaVersions(schema('1.10.0'), schema('1.9.0'))).to.be.above(0);
    expect(compareSharedSchemaVersions(schema('1.9.0'), schema('2.0.0'))).to.be.below(0);
    expect(compareSharedSchemaVersions(schema('1.0.0'), schema('1.0.0'))).to.equal(0);
  });
});

describe('registerSharedSchemas', () => {
  const schema = ($id) => ({ $id, type: 'object' });

  it('maps each schema by the path of its $id and freezes it', () => {
    const dashed = schema(`${ORIGIN}/schemas/shared/zx9-qk/versions/2.10.0`);
    const longest = schema(`${ORIGIN}/schemas/shared/${'a'.repeat(64)}/versions/1.0.0`);
    const byPath = registerSharedSchemas([dashed, longest]);
    expect([...byPath.keys()]).to.deep.equal([
      '/schemas/shared/zx9-qk/versions/2.10.0',
      `/schemas/shared/${'a'.repeat(64)}/versions/1.0.0`,
    ]);
    expect(byPath.get('/schemas/shared/zx9-qk/versions/2.10.0')).to.equal(dashed);
    expect(Object.isFrozen(dashed)).to.equal(true);
  });

  it('throws on an $id that is not a shared schema URL', () => {
    [
      undefined,
      42,
      'https://example.com/schemas/shared/image/versions/1.0.0',
      `${ORIGIN}.example.com/schemas/shared/image/versions/1.0.0`,
      `${ORIGIN}/schemas/image/versions/1.0.0`,
      `${ORIGIN}/schemas/shared/Image/versions/1.0.0`,
      `${ORIGIN}/schemas/shared/image-/versions/1.0.0`,
      `${ORIGIN}/schemas/shared/image/versions/1.0`,
      `${ORIGIN}/schemas/shared/image/versions/01.0.0`,
      `${ORIGIN}/schemas/shared/image/versions/v1.0.0`,
      `${ORIGIN}/schemas/shared/image/versions/1.0.0.json`,
      `${ORIGIN}/schemas/shared/image/v1.0.0.json`,
      `${ORIGIN}/schemas/shared/image/versions/1.0.0?draft`,
    ].forEach(($id) => {
      expect(() => registerSharedSchemas([schema($id)]), String($id)).to.throw('is not');
    });
  });

  it('throws on a name longer than 64 characters', () => {
    const $id = `${ORIGIN}/schemas/shared/${'a'.repeat(65)}/versions/1.0.0`;
    expect(() => registerSharedSchemas([schema($id)])).to.throw('longer than 64 characters');
  });

  it('throws on a duplicate $id', () => {
    const $id = `${ORIGIN}/schemas/shared/image/versions/1.0.0`;
    expect(() => registerSharedSchemas([schema($id), schema($id)])).to.throw('registered twice');
  });
});

describe('findSharedSchemaById', () => {
  it('finds a shared schema by its $id, and none for any other value', () => {
    SHARED_SCHEMAS.forEach((schema) => {
      expect(findSharedSchemaById(schema.$id), schema.$id).to.equal(schema);
    });
    [
      `${ORIGIN}/schemas/shared/image/versions/9.0.0`,
      `${ORIGIN}.example/schemas/shared/image/versions/1.0.0`,
      'https://example.com/schemas/shared/image/versions/1.0.0',
      '/schemas/shared/image/versions/1.0.0',
      undefined,
    ].forEach((id) => expect(findSharedSchemaById(id), String(id)).to.equal(undefined));
  });
});

describe('parseSharedSchemaName', () => {
  it('parses the name of a shared schema $id, also of a version this SDK lacks', () => {
    expect(parseSharedSchemaName(`${ORIGIN}/schemas/shared/image/versions/1.0.0`)).to.equal('image');
    expect(parseSharedSchemaName(`${ORIGIN}/schemas/shared/video-clip/versions/9.0.0`)).to.equal('video-clip');
    [
      `${ORIGIN}/schemas/image/versions/1.0.0`,
      'https://example.com/schemas/shared/image/versions/1.0.0',
      undefined,
    ].forEach((id) => expect(parseSharedSchemaName(id), String(id)).to.equal(undefined));
  });
});
