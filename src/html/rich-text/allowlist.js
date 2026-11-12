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

// The rich text the SDK keeps, a subset of the HTML that EDS keeps when it
// renders a page from DA.
export const ALLOWLIST = Object.freeze({
  paragraph: 'p',
  headings: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  quote: 'blockquote',
  lists: ['ul', 'ol'],
  listItem: 'li',
  marks: ['strong', 'em', 'u', 's', 'code', 'sup', 'sub'],
  lineBreak: 'br',
  link: {
    tagName: 'a',
    attributes: ['href', 'title'],
    protocols: ['http', 'https', 'mailto', 'tel'],
  },
  // Tags with the same meaning as an allowed tag, written as that tag.
  aliases: {
    b: 'strong',
    i: 'em',
    strike: 's',
    del: 's',
  },
});

// Every tag the SDK writes.
export const ALLOWED_TAG_NAMES = Object.freeze([
  ALLOWLIST.paragraph,
  ...ALLOWLIST.headings,
  ALLOWLIST.quote,
  ...ALLOWLIST.lists,
  ALLOWLIST.listItem,
  ...ALLOWLIST.marks,
  ALLOWLIST.lineBreak,
  ALLOWLIST.link.tagName,
]);
