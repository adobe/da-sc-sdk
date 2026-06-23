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
import { cleanHtmlWhitespace } from './test-utils.js';

describe('HTML to JSON Conversion', () => {
  describe('Basic conversions', () => {
    it('converts a simple block to JSON', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>name</p></div><div><p>John Doe</p></div></div>
              <div><div><p>email</p></div><div><p>john@example.com</p></div></div>
            </div>
          </div>
        </main>
      `;

      const { json } = convertHtmlToJson({ html });
      expect(json.metadata.schemaName).to.equal('test-schema');
      expect(json.data.name).to.equal('John Doe');
      expect(json.data.email).to.equal('john@example.com');
    });

    it('handles empty values', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>emptyField</p></div><div></div></div>
            </div>
          </div>
        </main>
      `;

      const { json } = convertHtmlToJson({ html });
      expect(json.data.emptyField).to.equal('');
    });

    it('converts boolean values', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>isActive</p></div><div><p>true</p></div></div>
              <div><div><p>isDisabled</p></div><div><p>false</p></div></div>
            </div>
          </div>
        </main>
      `;

      const { json } = convertHtmlToJson({ html });
      expect(json.data.isActive).to.equal(true);
      expect(json.data.isDisabled).to.equal(false);
    });

    it('converts number values', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>age</p></div><div><p>25</p></div></div>
              <div><div><p>price</p></div><div><p>99.99</p></div></div>
              <div><div><p>zero</p></div><div><p>0</p></div></div>
            </div>
          </div>
        </main>
      `;

      const { json } = convertHtmlToJson({ html });
      expect(json.data.age).to.equal(25);
      expect(json.data.price).to.equal(99.99);
      expect(json.data.zero).to.equal(0);
    });

    // Regression: string codes that look like numbers must survive untouched.
    // `Number()` accepts lossy forms (scientific notation, hex, leading/
    // trailing zeros, big ints) that previously corrupted such codes.
    it('keeps non-canonical numeric-looking strings as strings', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>sci</p></div><div><p>710E-3</p></div></div>
              <div><div><p>exp</p></div><div><p>1E3</p></div></div>
              <div><div><p>hex</p></div><div><p>0xFF</p></div></div>
              <div><div><p>leadingZero</p></div><div><p>007</p></div></div>
              <div><div><p>trailingZero</p></div><div><p>1.50</p></div></div>
              <div><div><p>bigInt</p></div><div><p>12345678901234567890</p></div></div>
            </div>
          </div>
        </main>
      `;

      const { json } = convertHtmlToJson({ html });
      expect(json.data.sci).to.equal('710E-3');
      expect(json.data.exp).to.equal('1E3');
      expect(json.data.hex).to.equal('0xFF');
      expect(json.data.leadingZero).to.equal('007');
      expect(json.data.trailingZero).to.equal('1.50');
      expect(json.data.bigInt).to.equal('12345678901234567890');
    });

    // Regression: list items that look like numbers must also be preserved.
    it('preserves numeric-looking list items verbatim', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div>
                <div><p>codes</p></div>
                <div><ul><li>710E-3</li><li>AB12-01</li><li>X-003</li><li>N480-5</li></ul></div>
              </div>
            </div>
          </div>
        </main>
      `;

      const { json } = convertHtmlToJson({ html });
      expect(json.data.codes).to.deep.equal(['710E-3', 'AB12-01', 'X-003', 'N480-5']);
    });

    // Canonical numbers (incl. negatives) still coerce, so genuine number
    // fields are unaffected.
    it('still coerces canonical numbers, including negatives', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>neg</p></div><div><p>-5</p></div></div>
              <div><div><p>negFloat</p></div><div><p>-3.14</p></div></div>
            </div>
          </div>
        </main>
      `;

      const { json } = convertHtmlToJson({ html });
      expect(json.data.neg).to.equal(-5);
      expect(json.data.negFloat).to.equal(-3.14);
    });

    it('handles metadata properties', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
              <div><div><p>version</p></div><div><p>1</p></div></div>
              <div><div><p>author</p></div><div><p>Test Author</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>field</p></div><div><p>value</p></div></div>
            </div>
          </div>
        </main>
      `;

      const { json } = convertHtmlToJson({ html });
      expect(json.metadata.schemaName).to.equal('test-schema');
      expect(json.metadata.version).to.equal(1);
      expect(json.metadata.author).to.equal('Test Author');
    });

    it('returns { error } for empty or non-string input', () => {
      expect(convertHtmlToJson({ html: '' }).error).to.match(/non-empty string/);
      expect(convertHtmlToJson({ html: '   ' }).error).to.match(/non-empty string/);
      expect(convertHtmlToJson({ html: null }).error).to.match(/non-empty string/);
      expect(convertHtmlToJson({ html: undefined }).error).to.match(/non-empty string/);
      expect(convertHtmlToJson().error).to.match(/non-empty string/);
    });
  });

  describe('Nested arrays', () => {
    it('converts arrays of arrays (primitives)', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>items</p></div><div><ul><li>self://#items-abc123</li><li>self://#items-def456</li></ul></div></div>
            </div>
            <div class="items items-abc123">
              <div><div><p>@items</p></div><div><ul><li>Item 1A</li><li>Item 1B</li></ul></div></div>
            </div>
            <div class="items items-def456">
              <div><div><p>@items</p></div><div><ul><li>Item 2A</li><li>Item 2B</li></ul></div></div>
            </div>
          </div>
        </main>
      `;

      const { json } = convertHtmlToJson({ html });
      expect(json.metadata.schemaName).to.equal('test-schema');
      expect(json.data.items).to.be.an('array').with.lengthOf(2);
      expect(json.data.items[0]).to.deep.equal(['Item 1A', 'Item 1B']);
      expect(json.data.items[1]).to.deep.equal(['Item 2A', 'Item 2B']);
    });

    it('converts arrays of arrays (objects)', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>groups</p></div><div><ul><li>self://#groups-abc123</li><li>self://#groups-def456</li></ul></div></div>
            </div>
            <div class="groups groups-abc123">
              <div><div><p>@items</p></div><div><ul><li>self://#groups-obj1</li><li>self://#groups-obj2</li></ul></div></div>
            </div>
            <div class="groups groups-def456">
              <div><div><p>@items</p></div><div><ul><li>self://#groups-obj3</li></ul></div></div>
            </div>
            <div class="groups groups-obj1">
              <div><div><p>name</p></div><div><p>Item 1</p></div></div>
              <div><div><p>value</p></div><div><p>A</p></div></div>
            </div>
            <div class="groups groups-obj2">
              <div><div><p>name</p></div><div><p>Item 2</p></div></div>
              <div><div><p>value</p></div><div><p>B</p></div></div>
            </div>
            <div class="groups groups-obj3">
              <div><div><p>name</p></div><div><p>Item 3</p></div></div>
              <div><div><p>value</p></div><div><p>C</p></div></div>
            </div>
          </div>
        </main>
      `;

      const { json } = convertHtmlToJson({ html });
      expect(json.data.groups).to.be.an('array').with.lengthOf(2);
      expect(json.data.groups[0][0]).to.deep.equal({ name: 'Item 1', value: 'A' });
      expect(json.data.groups[0][1]).to.deep.equal({ name: 'Item 2', value: 'B' });
      expect(json.data.groups[1][0]).to.deep.equal({ name: 'Item 3', value: 'C' });
    });

    it('converts arrays within nested objects', () => {
      const html = `
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>test-schema</p></div></div>
            </div>
            <div class="test-schema">
              <div><div><p>records</p></div><div><ul><li>self://#records-abc123</li><li>self://#records-def456</li></ul></div></div>
            </div>
            <div class="records records-abc123">
              <div><div><p>name</p></div><div><p>Record 1</p></div></div>
              <div><div><p>tags</p></div><div><ul><li>Tag 1A</li><li>Tag 1B</li><li>Tag 1C</li></ul></div></div>
            </div>
            <div class="records records-def456">
              <div><div><p>name</p></div><div><p>Record 2</p></div></div>
              <div><div><p>tags</p></div><div><ul><li>Tag 2A</li><li>Tag 2B</li></ul></div></div>
            </div>
          </div>
        </main>
      `;

      const { json } = convertHtmlToJson({ html });
      expect(json.data.records).to.be.an('array').with.lengthOf(2);
      expect(json.data.records[0].name).to.equal('Record 1');
      expect(json.data.records[0].tags).to.deep.equal(['Tag 1A', 'Tag 1B', 'Tag 1C']);
      expect(json.data.records[1].name).to.equal('Record 2');
      expect(json.data.records[1].tags).to.deep.equal(['Tag 2A', 'Tag 2B']);
    });
  });

  describe('Real-world fixtures', () => {
    async function compareFixture(name) {
      const htmlRaw = await readFile({ path: `./mocks/${name}.html` });
      const expectedJson = JSON.parse(await readFile({ path: `./mocks/${name}.json` }));
      const { json } = convertHtmlToJson({ html: cleanHtmlWhitespace(htmlRaw) });
      expect(json.metadata).to.deep.equal(expectedJson.metadata);
      expect(json.data).to.deep.equal(expectedJson.data);
    }

    it('converts simpleForm.html', () => compareFixture('simpleForm'));
    it('converts nestedForm.html', () => compareFixture('nestedForm'));
    it('converts simpleArray.html', () => compareFixture('simpleArray'));
    it('converts nestedArrays.html', () => compareFixture('nestedArrays'));
    it('converts rootArray.html', () => compareFixture('rootArray'));
    it('converts invalidForm.html', () => compareFixture('invalidForm'));
  });

  // EDS-formatted HTML is what real Edge Delivery Services pages serve: the
  // markup is pretty-printed (whitespace text nodes between tags) and value
  // cells often contain direct text (no <p> wrapper). The parser must
  // tolerate both shapes — the worker integration hit this and had to
  // pre-normalize until the SDK was fixed (see HTML2JSON_SDK_ISSUE.md).
  describe('EDS-formatted HTML (whitespace + unwrapped values)', () => {
    it('parses pretty-printed HTML with whitespace text nodes between tags', () => {
      const html = `<body>
        <main>
          <div>
            <div class="da-form">
              <div>
                <div><p>x-schema-name</p></div>
                <div><p>blog-post</p></div>
              </div>
              <div>
                <div><p>title</p></div>
                <div><p>Demo Post</p></div>
              </div>
            </div>
            <div class="blog-post">
              <div>
                <div><p>name</p></div>
                <div><p>Alice</p></div>
              </div>
            </div>
          </div>
        </main>
      </body>`;
      const { json } = convertHtmlToJson({ html });
      expect(json.metadata.schemaName).to.equal('blog-post');
      expect(json.metadata.title).to.equal('Demo Post');
      expect(json.data.name).to.equal('Alice');
    });

    it('parses value cells that contain direct text (no <p> wrapper)', () => {
      const html = `<body>
        <main>
          <div>
            <div class="da-form">
              <div><div>x-schema-name</div><div>blog-post</div></div>
              <div><div>title</div><div>Demo Post</div></div>
            </div>
            <div class="blog-post">
              <div><div>name</div><div>Alice</div></div>
              <div><div>age</div><div>42</div></div>
            </div>
          </div>
        </main>
      </body>`;
      const { json } = convertHtmlToJson({ html });
      expect(json.metadata.schemaName).to.equal('blog-post');
      expect(json.metadata.title).to.equal('Demo Post');
      expect(json.data.name).to.equal('Alice');
      expect(json.data.age).to.equal(42);
    });

    it('parses key cells wrapped in <h3> (heading instead of <p>)', () => {
      const html = `<body>
        <main>
          <div>
            <div class="da-form">
              <div><div><h3>x-schema-name</h3></div><div><p>blog-post</p></div></div>
            </div>
            <div class="blog-post">
              <div><div><h3>title</h3></div><div><p>Hello</p></div></div>
            </div>
          </div>
        </main>
      </body>`;
      const { json } = convertHtmlToJson({ html });
      expect(json.metadata.schemaName).to.equal('blog-post');
      expect(json.data.title).to.equal('Hello');
    });

    it('reads keys from ANY wrapper element (h1-h6, p, span, strong, nested) — tag-agnostic', () => {
      // Customers may emit keys wrapped in any element they choose, and the
      // choice may change over time (h3 today, h2 tomorrow, h4 the day
      // after). The parser MUST read keys via descendant-text-content only,
      // never by branching on the wrapper's tag name.
      const html = `<body>
        <main>
          <div>
            <div class="da-form">
              <div><div><h1>x-schema-name</h1></div><div>blog-post</div></div>
              <div><div><h2>title</h2></div><div>Demo</div></div>
            </div>
            <div class="blog-post">
              <div><div><h4>name</h4></div><div>Alice</div></div>
              <div><div><h5>age</h5></div><div>42</div></div>
              <div><div><h6>active</h6></div><div>true</div></div>
              <div><div><span>nickname</span></div><div>Al</div></div>
              <div><div><strong>role</strong></div><div>admin</div></div>
              <div><div><p>note</p></div><div>plain p key</div></div>
              <div><div>bare-text-key</div><div>x</div></div>
              <div><div><p><strong>nested</strong> wrapper</p></div><div>wrapped</div></div>
            </div>
          </div>
        </main>
      </body>`;
      const { json } = convertHtmlToJson({ html });
      expect(json.metadata.schemaName).to.equal('blog-post');
      expect(json.metadata.title).to.equal('Demo');
      expect(json.data.name).to.equal('Alice');
      expect(json.data.age).to.equal(42);
      expect(json.data.active).to.equal(true);
      expect(json.data.nickname).to.equal('Al');
      expect(json.data.role).to.equal('admin');
      expect(json.data.note).to.equal('plain p key');
      expect(json.data['bare-text-key']).to.equal('x');
      // Nested wrapper: text-content recursion concatenates "nested" + " wrapper".
      expect(json.data['nested wrapper']).to.equal('wrapped');
    });

    it('accepts <ol> as well as <ul> for arrays', () => {
      // The wire format the SDK produces uses <ul>, but external producers
      // (other tools, hand-authoring) may emit <ol>. Same semantic value;
      // the parser must accept both.
      const html = `<body>
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>blog-post</p></div></div>
            </div>
            <div class="blog-post">
              <div><div><p>tags</p></div><div><ol><li>red</li><li>blue</li></ol></div></div>
            </div>
          </div>
        </main>
      </body>`;
      const { json } = convertHtmlToJson({ html });
      expect(json.metadata.schemaName).to.equal('blog-post');
      expect(json.data.tags).to.deep.equal(['red', 'blue']);
    });

    it('returns [] for an empty <ul>', () => {
      const html = `<body><main><div>
        <div class="da-form"><div><div><p>x-schema-name</p></div><div><p>x</p></div></div></div>
        <div class="x"><div><div><p>tags</p></div><div><ul></ul></div></div></div>
      </div></main></body>`;
      const { json } = convertHtmlToJson({ html });
      expect(json.data.tags).to.deep.equal([]);
    });

    it('returns [] for an empty <ol>', () => {
      const html = `<body><main><div>
        <div class="da-form"><div><div><p>x-schema-name</p></div><div><p>x</p></div></div></div>
        <div class="x"><div><div><p>tags</p></div><div><ol></ol></div></div></div>
      </div></main></body>`;
      const { json } = convertHtmlToJson({ html });
      expect(json.data.tags).to.deep.equal([]);
    });

    it('returns [] for a <ul> that contains only non-<li> children', () => {
      // Defensive: a list whose contents are all malformed (no <li> at all)
      // must be treated as an empty array, not as an array of formatting
      // junk. This is the inverse of the "stray non-<li> elements" case.
      const html = `<body><main><div>
        <div class="da-form"><div><div><p>x-schema-name</p></div><div><p>x</p></div></div></div>
        <div class="x">
          <div>
            <div><p>tags</p></div>
            <div><ul><p>not an item</p><span>also not</span></ul></div>
          </div>
        </div>
      </div></main></body>`;
      const { json } = convertHtmlToJson({ html });
      expect(json.data.tags).to.deep.equal([]);
    });

    it('ignores stray non-<li> elements inside the list', () => {
      // Some HTML editors (or hand-authoring) insert formatting elements
      // (`<p>`, `<br>`, comments) inside a list. Only `<li>` children
      // should count as array items.
      const html = `<body>
        <main>
          <div>
            <div class="da-form">
              <div><div><p>x-schema-name</p></div><div><p>blog-post</p></div></div>
            </div>
            <div class="blog-post">
              <div>
                <div><p>tags</p></div>
                <div>
                  <ul>
                    <li>red</li>
                    <p>stray paragraph that is not an item</p>
                    <li>blue</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </main>
      </body>`;
      const { json } = convertHtmlToJson({ html });
      expect(json.data.tags).to.deep.equal(['red', 'blue']);
    });

    it('parses the combined hard case: pretty-printed + h3 keys + unwrapped values', () => {
      // This is the exact shape that broke the worker integration.
      const html = `<body>
        <main>
          <div>
            <div class="da-form">
              <div>
                <div><h3>x-schema-name</h3></div>
                <div>blog-post</div>
              </div>
              <div>
                <div><h3>title</h3></div>
                <div>Demo Post</div>
              </div>
            </div>
            <div class="blog-post">
              <div>
                <div><h3>name</h3></div>
                <div>Alice</div>
              </div>
              <div>
                <div><h3>active</h3></div>
                <div>true</div>
              </div>
            </div>
          </div>
        </main>
      </body>`;
      const { json } = convertHtmlToJson({ html });
      expect(json.metadata.schemaName).to.equal('blog-post');
      expect(json.metadata.title).to.equal('Demo Post');
      expect(json.data.name).to.equal('Alice');
      expect(json.data.active).to.equal(true);
    });
  });
});
