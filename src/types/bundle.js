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

import { deepClone } from '../shared/clone.js';
import { isJsonObject } from '../shared/object.js';
import { registeredType } from './index.js';

// The type URLs the schema references, as written and in first-use order.
function referencedTypeUrls(node, found = new Set()) {
  if (Array.isArray(node)) {
    node.forEach((entry) => referencedTypeUrls(entry, found));
  } else if (node && typeof node === 'object') {
    if (registeredType(node.$ref)) {
      found.add(node.$ref);
    }
    Object.values(node).forEach((value) => referencedTypeUrls(value, found));
  }
  return found;
}

// `base`, or `base-2`, `base-3`, … when `$defs` already uses it.
function freeKey({ defs, base, suffix = 1 }) {
  const key = suffix === 1 ? base : `${base}-${suffix}`;
  if (!Object.hasOwn(defs, key)) {
    return key;
  }
  return freeKey({ defs, base, suffix: suffix + 1 });
}

// Bundles the schema in the JSON Schema sense. Each referenced type is embedded
// under `$defs` with its `$id`, so validators resolve the `$ref`s without fetching.
export function bundleSchema({ schema } = {}) {
  if (!isJsonObject(schema)) {
    return { error: 'Schema must be an object.' };
  }
  const bundled = deepClone(schema);
  const refs = referencedTypeUrls(schema);
  if (!refs.size) {
    return { schema: bundled };
  }

  const { $defs } = bundled;
  const defs = isJsonObject($defs) ? $defs : {};
  for (const ref of refs) {
    const { name, version, schema: definition } = registeredType(ref);
    const embedded = Object.values(defs).some((def) => def?.$id === ref);
    if (!embedded) {
      defs[freeKey({ defs, base: `da-${name}-${version}` })] = deepClone(definition);
    }
  }
  bundled.$defs = defs;
  return { schema: bundled };
}
