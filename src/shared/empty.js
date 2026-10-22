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

// The one rule for "is this value form-empty?" in the SDK.
//
// Empty are null, undefined, blank strings, and containers whose every leaf
// is empty, so `{ a: '' }` and `['', { b: ' ' }]` are empty. `0` and `false`
// are values. Validation, defaults and the HTML writer all decide by
// this rule, so a value validation treats as absent is exactly one that save
// leaves out. A test in test/state-engine/index.test.js pins that symmetry.
export function isDataEmpty(value) {
  if (value === null || value === undefined || value === '') { return true; }
  if (typeof value === 'string') { return value.trim() === ''; }
  if (Array.isArray(value)) { return value.length === 0 || value.every(isDataEmpty); }
  if (typeof value === 'object') {
    const entries = Object.values(value);
    return entries.length === 0 || entries.every(isDataEmpty);
  }
  return false;
}
