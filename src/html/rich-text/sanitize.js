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

import { sanitize } from 'hast-util-sanitize';
import { ALLOWED_TAG_NAMES, ALLOWLIST } from './allowlist.js';

// Blocks outside the allowlist whose content is kept as blocks of its own,
// such as the cells of a table. Normalizing unwraps them.
export const CONTAINERS = Object.freeze([
  'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  'figure', 'figcaption', 'address',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'dl', 'dt', 'dd',
]);

// Preformatted text, kept as a paragraph with its line breaks.
export const PREFORMATTED = 'pre';

// Active and embedded content and document metadata, removed with everything
// inside. Any other tag outside the schema is unwrapped.
const STRIPPED = [
  'script', 'style', 'template', 'iframe', 'object', 'embed', 'noscript',
  'head', 'title', 'meta', 'link', 'img', 'picture', 'video', 'audio',
  'source', 'svg', 'math', 'canvas', 'input', 'button', 'select', 'textarea',
];

const SCHEMA = {
  tagNames: [
    ...ALLOWED_TAG_NAMES,
    ...Object.keys(ALLOWLIST.aliases),
    ...CONTAINERS,
    PREFORMATTED,
  ],
  attributes: {
    [ALLOWLIST.link.tagName]: ALLOWLIST.link.attributes,
  },
  // Links are checked with the URL parser below, which reads them as a browser does.
  protocols: {},
  strip: STRIPPED,
};

// Protocols that run script, and Windows protocols that start an app. A link with one
// of them loses its href. Any other protocol is kept, so links can open custom apps.
const BLOCKED_PROTOCOLS = Object.freeze(['javascript', 'data', 'vbscript', 'search', 'search-ms']);
const BLOCKED_PROTOCOL_PREFIX = 'ms-';

// The link as an absolute URL, or null when it is relative to the page.
function absoluteUrl(href) {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

function isBlockedProtocol(protocol) {
  return BLOCKED_PROTOCOLS.includes(protocol) || protocol.startsWith(BLOCKED_PROTOCOL_PREFIX);
}

// Whether a browser opens the link with a protocol that is not blocked. The URL
// parser reads the protocol as a browser does, ignoring case, surrounding spaces
// and control characters. A relative link stays on the page's protocol.
function isAllowedHref(href) {
  const url = absoluteUrl(href);
  if (!url) {
    return true;
  }

  const protocol = url.protocol.slice(0, -1);
  return !isBlockedProtocol(protocol);
}

// Removes every href with a blocked protocol below the node.
function removeUnsafeHrefs(node) {
  const href = node.properties?.href;
  if (typeof href === 'string' && !isAllowedHref(href)) {
    delete node.properties.href;
  }
  (node.children ?? []).forEach(removeUnsafeHrefs);
}

// The nodes without comments, active content, unsafe links and attributes
// other than a link's. Normalizing reads the rest.
export function sanitizeNodes(nodes) {
  const root = sanitize({ type: 'root', children: nodes }, SCHEMA);
  removeUnsafeHrefs(root);
  return root.children;
}
