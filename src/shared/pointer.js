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

// RFC 6901 JSON Pointer building and parsing, shared by the model and the HTML
// writer so both address a value the same way.

// The pointer of a document's data, the root of the model.
export const DATA_POINTER = '/data';

export function escapeSegment(segment) {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function appendPointer({ pointer, segment }) {
  const base = pointer === '' || pointer === '/' ? '' : pointer.replace(/\/$/, '');
  const escaped = escapeSegment(segment);
  return base ? `${base}/${escaped}` : `/${escaped}`;
}

/**
 * Unescapes a pointer segment, the reverse of `escapeSegment`.
 * @param {string} segment The escaped segment.
 * @returns {string} The segment.
 */
function unescapeSegment(segment) {
  return String(segment).replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Parses a pointer into its segments.
 * @param {unknown} pointer The pointer, such as `/data/hero/src`.
 * @returns {string[]} The unescaped segments, or none for an empty pointer or
 *   a value that isn't a string.
 */
export function parsePointer(pointer) {
  if (typeof pointer !== 'string') {
    return [];
  }

  const path = pointer.replace(/^\//, '');
  if (path === '') {
    return [];
  }

  return path.split('/').map(unescapeSegment);
}

/**
 * The pointer of the value that holds the value at a pointer.
 * @param {unknown} pointer The pointer, such as `/data/hero/src`.
 * @returns {string} The parent pointer, such as `/data/hero`, or an empty string
 *   for a pointer without a parent.
 */
export function getParentPointer(pointer) {
  const segments = parsePointer(pointer);
  if (segments.length <= 1) {
    return '';
  }

  const parentSegments = segments.slice(0, -1).map(escapeSegment);
  return `/${parentSegments.join('/')}`;
}
