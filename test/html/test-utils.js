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

export const modelOf = (schema, json) => createEngine({ schema, document: json }).getState().model;

// Saves `json` the way the editor does: with the model the engine builds for
// it from `schema`. Without a schema, no model is passed.
export const save = ({ json, schema, config }) => convertJsonToHtml({
  json,
  model: schema === undefined ? undefined : modelOf(schema, json),
  config,
});

export function cleanHtmlWhitespace(html) {
  return html.replace(/>\s+</g, '><').trim().replace(/\s+/g, ' ').trim();
}

export function normalizeHtml(html) {
  // Extract just the main content, remove dynamic GUIDs for comparison
  const cleaned = cleanHtmlWhitespace(html);
  // Replace dynamic GUIDs with a placeholder for comparison
  return cleaned.replace(/-([\w]{6})/g, '-GUID');
}
