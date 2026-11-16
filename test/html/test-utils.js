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

import { createEngine } from '../../src/index.js';
import { convertJsonToHtml } from '../../src/html/json2html.js';
import { isDataEmpty } from '../../src/shared/empty.js';

export const modelOf = (schema, json) => createEngine({ schema, document: json }).getState().model;

// Saves `json` the way the editor does: the engine's document with its model,
// built from `schema`. Without a schema, `json` is saved without a model.
export function save({ json, schema, config }) {
  if (schema === undefined) {
    return convertJsonToHtml({ json, config });
  }

  const { document, model } = createEngine({ schema, document: json }).getState();
  return convertJsonToHtml({ json: document, model, config });
}

// What save keeps of a value: the value without its empty leaves, or undefined
// when it is empty as a whole. Tests check the writer and validation against it.
export function prune(value) {
  if (isDataEmpty(value)) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(prune).filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([key, propertyValue]) => [key, prune(propertyValue)])
      .filter(([, propertyValue]) => propertyValue !== undefined));
  }
  return value;
}

export function cleanHtmlWhitespace(html) {
  return html.replace(/>\s+</g, '><').trim().replace(/\s+/g, ' ').trim();
}

// Block IDs differ between writers (random in older fixtures, numbered now), so
// references and block classes are compared without them.
export function normalizeHtml(html) {
  return cleanHtmlWhitespace(html)
    .replace(/(self:\/\/#[\w-]+?-)[a-z0-9]+(?=[<\s"])/g, '$1ID')
    .replace(/(class="([^" ]+) \2-)[a-z0-9]+"/g, '$1ID"');
}
