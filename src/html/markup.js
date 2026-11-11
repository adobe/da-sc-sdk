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

// Markup shared by the writer and its codecs. Text and attribute values are
// escaped here, structural markup is composed from template literals.

export function escapeText(value) {
  return String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

export function escapeAttr(value) {
  return String(value).replace(/[&"]/g, (c) => ({ '&': '&amp;', '"': '&quot;' }[c]));
}

// Like `node.textContent = value`, so `null` becomes empty and anything else a string.
export function textContent(value) {
  if (value === null) {
    return '';
  }
  return escapeText(value);
}

export function row({ key, cellHtml }) {
  return `<div><div><h3>${textContent(key)}</h3></div>${cellHtml ?? ''}</div>`;
}

export function block({ className, innerHtml }) {
  return `<div class="${escapeAttr(className.toLowerCase())}">${innerHtml}</div>`;
}
