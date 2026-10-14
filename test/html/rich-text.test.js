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
import { fromHtml } from 'hast-util-from-html';
import { sanitizeRichText, richTextFromNodes, safeHref } from '../../src/html/rich-text.js';

describe('rich-text sanitizer', () => {
  describe('sanitizeRichText', () => {
    it('keeps canonical markup unchanged', () => {
      const html = '<p>Hello <strong>bold</strong> <em>it</em> <u>u</u> <s>s</s> <a href="https://adobe.com">link</a><br>next</p><ul><li>one<ul><li>nested</li></ul></li></ul><ol><li>two</li></ol>';
      expect(sanitizeRichText(html)).to.equal(html);
    });

    it('is idempotent', () => {
      const once = sanitizeRichText('<div><b>a</b> <i>b</i></div><h2>Title</h2>');
      expect(sanitizeRichText(once)).to.equal(once);
    });

    it('normalizes equivalent tags', () => {
      expect(sanitizeRichText('<p><b>a</b><i>b</i><strike>c</strike><del>d</del></p>'))
        .to.equal('<p><strong>a</strong><em>b</em><s>c</s><s>d</s></p>');
    });

    it('wraps loose inline content in paragraphs', () => {
      expect(sanitizeRichText('Hello <strong>world</strong><ul><li>x</li></ul>tail'))
        .to.equal('<p>Hello <strong>world</strong></p><ul><li>x</li></ul><p>tail</p>');
    });

    it('flattens unknown block containers into paragraphs', () => {
      expect(sanitizeRichText('<div><section><p>One</p></section>Two<pre>Three</pre></div>'))
        .to.equal('<p>One</p><p>Two</p><p>Three</p>');
    });

    it('keeps headings and blockquotes', () => {
      const html = '<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6><blockquote><p>Quote</p><h2>Head</h2><ul><li>item</li></ul><blockquote><p>Nested</p></blockquote></blockquote>';
      expect(sanitizeRichText(html)).to.equal(html);
    });

    it('trims headings and drops empty headings and blockquotes', () => {
      expect(sanitizeRichText('<h2>  Title <br></h2><h3> </h3><blockquote><p> </p></blockquote>'))
        .to.equal('<h2>Title</h2>');
    });

    it('wraps loose blockquote text in paragraphs', () => {
      expect(sanitizeRichText('<blockquote>Said <em>this</em></blockquote>'))
        .to.equal('<blockquote><p>Said <em>this</em></p></blockquote>');
    });

    it('flattens headings and blockquotes inside list items', () => {
      expect(sanitizeRichText('<ul><li><h2>Title</h2><blockquote><p>Quote</p></blockquote></li></ul>'))
        .to.equal('<ul><li>Title<br>Quote</li></ul>');
    });

    it('keeps inline code, superscript and subscript', () => {
      const html = '<p><code>x()</code> E=mc<sup>2</sup> H<sub>2</sub>O <strong><code>b</code></strong></p>';
      expect(sanitizeRichText(html)).to.equal(html);
    });

    it('unwraps unknown inline elements and drops attributes', () => {
      expect(sanitizeRichText('<p class="x" style="color:red"><span data-a="1">a<kbd>b</kbd><code class="c">c</code></span></p>'))
        .to.equal('<p>ab<code>c</code></p>');
    });

    it('drops active and embedded content', () => {
      expect(sanitizeRichText('<p>a<script>alert(1)</script><img src="x" onerror="alert(1)">b</p><style>p{}</style><iframe src="x"></iframe>'))
        .to.equal('<p>ab</p>');
    });

    it('unwraps links with unsafe or missing hrefs', () => {
      expect(sanitizeRichText('<p><a href="javascript:alert(1)">a</a><a href=" java\tscript:x">b</a><a>c</a><a href="data:text/html,x">d</a></p>'))
        .to.equal('<p>abcd</p>');
    });

    it('keeps a trimmed link title', () => {
      expect(sanitizeRichText('<p><a href="/a" title="  A  &quot;b&quot;\n c ">a</a><a href="/b" title=" ">b</a></p>'))
        .to.equal('<p><a href="/a" title="A &quot;b&quot; c">a</a><a href="/b">b</a></p>');
    });

    it('keeps links with safe or relative hrefs', () => {
      expect(sanitizeRichText('<p><a href="/path" target="_blank" onclick="x()">a</a><a href="mailto:a@b.c">b</a><a href="#top">c</a></p>'))
        .to.equal('<p><a href="/path">a</a><a href="mailto:a@b.c">b</a><a href="#top">c</a></p>');
    });

    it('escapes text and attribute values', () => {
      expect(sanitizeRichText('<p>a &lt;b&gt; &amp; c <a href="/x?a=1&amp;b=&quot;2&quot;">l</a></p>'))
        .to.equal('<p>a &lt;b&gt; &amp; c <a href="/x?a=1&amp;b=&quot;2&quot;">l</a></p>');
    });

    it('removes empty paragraphs, marks, items and lists', () => {
      expect(sanitizeRichText('<p></p><p> <br> </p><p><strong></strong>x</p><ul><li></li></ul><ol><li> </li><li>y</li></ol>'))
        .to.equal('<p>x</p><ol><li>y</li></ol>');
    });

    it('collapses whitespace and trims paragraph edges', () => {
      expect(sanitizeRichText('<p>\n  Hello\n   world  <br> </p>')).to.equal('<p>Hello world</p>');
    });

    it('joins paragraphs inside list items with line breaks', () => {
      expect(sanitizeRichText('<ul><li><p>a</p><p>b</p><ol><li>c</li></ol></li></ul>'))
        .to.equal('<ul><li>a<br>b<ol><li>c</li></ol></li></ul>');
    });

    it('treats stray list items as paragraphs', () => {
      expect(sanitizeRichText('<li>a</li>')).to.equal('<p>a</p>');
    });

    it('converts plain text into paragraphs and line breaks', () => {
      expect(sanitizeRichText('First line\nsecond line\n\nNext a < b & more'))
        .to.equal('<p>First line<br>second line</p><p>Next a &lt; b &amp; more</p>');
    });

    it('returns an empty string for empty input', () => {
      expect(sanitizeRichText(undefined)).to.equal('');
      expect(sanitizeRichText(null)).to.equal('');
      expect(sanitizeRichText('   ')).to.equal('');
      expect(sanitizeRichText('<p> </p>')).to.equal('');
    });

    it('stringifies non-string values', () => {
      expect(sanitizeRichText(42)).to.equal('<p>42</p>');
    });
  });

  describe('richTextFromNodes', () => {
    it('serializes hast children', () => {
      const tree = fromHtml('<p>a <b>b</b></p><ul><li>c</li></ul>', { fragment: true });
      expect(richTextFromNodes(tree.children)).to.equal('<p>a <strong>b</strong></p><ul><li>c</li></ul>');
    });

    it('defaults to an empty list', () => {
      expect(richTextFromNodes()).to.equal('');
    });
  });

  describe('safeHref', () => {
    it('accepts allowed schemes and relative references', () => {
      ['https://a.b', 'http://a.b', 'mailto:a@b.c', 'tel:+1', '/a', './a', '../a', '#a', '?q=1', 'page.html']
        .forEach((href) => expect(safeHref(href)).to.equal(href));
    });

    it('rejects unsafe schemes, empty and non-string values', () => {
      // eslint-disable-next-line no-script-url
      ['javascript:x', 'JAVASCRIPT:x', 'vbscript:x', 'data:x', ' \u0001javascript:x', '', '   ', null, 1]
        .forEach((href) => expect(safeHref(href)).to.equal(null));
    });
  });
});
