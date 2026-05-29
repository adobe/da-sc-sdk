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

// Shared helpers for the HTML codec.

function isEmpty(value) {
  if (value === null || value === undefined || value === '') { return true; }
  if (typeof value === 'string' && value.trim() === '') { return true; }
  if (Array.isArray(value)) { return value.length === 0; }
  if (typeof value === 'object') { return Object.keys(value).length === 0; }
  return false;
}

// Recursively strips empty leaves from a value:
//   null / undefined / '' / whitespace-only string → undefined
//   array → returns undefined if every element is empty after pruning
//   object → returns undefined if every property is empty after pruning
//   primitives → passed through unchanged
//
// Mirrors the rule the editor uses to decide what's "form-empty" in
// validation. Used by convertJsonToHtml on the save path so unused
// fields don't pollute the persisted HTML.
export function prune(value) {
  if (value === null || value === undefined || value === '') { return undefined; }
  if (typeof value === 'string' && value.trim() === '') { return undefined; }

  if (Array.isArray(value)) {
    const filtered = value.map(prune).filter((item) => !isEmpty(item));
    return filtered.length === 0 ? undefined : filtered;
  }

  if (typeof value === 'object') {
    const result = {};
    for (const [key, propertyValue] of Object.entries(value)) {
      const filtered = prune(propertyValue);
      if (filtered !== undefined && !isEmpty(filtered)) {
        result[key] = filtered;
      }
    }
    return Object.keys(result).length === 0 ? undefined : result;
  }

  return value;
}
