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

// RFC 6901 JSON Pointer building, shared by the model and the HTML writer so
// both address a value the same way.

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
