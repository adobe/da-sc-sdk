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

// Type versions are named `v<major>.<minor>.<patch>`.

function versionParts(version) {
  return version.slice(1).split('.').map(Number);
}

function isNewer(a, b) {
  const aParts = versionParts(a);
  const bParts = versionParts(b);
  const index = aParts.findIndex((part, i) => part !== bParts[i]);
  return index !== -1 && aParts[index] > bParts[index];
}

// The latest version of each type, by name.
export function latestByName(types) {
  const latest = new Map();
  types.forEach((type) => {
    const current = latest.get(type.name);
    if (!current || isNewer(type.version, current.version)) {
      latest.set(type.name, type);
    }
  });
  return Object.freeze(Object.fromEntries(latest));
}
