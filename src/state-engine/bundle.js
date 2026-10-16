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

// Embed the definitions a schema references by URL, so validators that do not
// fetch references (most of them) can use the schema offline. Each definition
// keeps its `$id`, so the schema's `$ref`s resolve to the embedded copy.

import { deepClone } from './clone.js';
import { assetDefinition, isAssetRef } from './asset-schema.js';

// The asset definitions the schema references, in first-use order.
function referencedAssets(node, found = new Set()) {
  if (Array.isArray(node)) {
    node.forEach((entry) => referencedAssets(entry, found));
  } else if (node && typeof node === 'object') {
    if (isAssetRef(node.$ref)) { found.add(node.$ref); }
    Object.values(node).forEach((value) => referencedAssets(value, found));
  }
  return found;
}

function freeKey(defs, base) {
  let key = base;
  for (let n = 2; Object.hasOwn(defs, key); n += 1) { key = `${base}-${n}`; }
  return key;
}

// `bundleSchema({ schema })` returns `{ schema }`: a copy of the schema with
// each asset definition it references (image, file) under `$defs`, as
// `da-image-v1` or `da-file-v1`. The input is not modified, and a definition
// the schema already embeds is not added again.
export function bundleSchema({ schema } = {}) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { error: 'Schema must be an object.' };
  }
  const bundled = deepClone(schema);
  const refs = referencedAssets(schema);
  if (!refs.size) { return { schema: bundled }; }

  const { $defs } = bundled;
  const defs = $defs && typeof $defs === 'object' && !Array.isArray($defs) ? $defs : {};
  for (const ref of refs) {
    const { assetType, schema: definition } = assetDefinition(ref);
    const embedded = Object.values(defs).some((def) => def?.$id === definition.$id);
    if (!embedded) { defs[freeKey(defs, `da-${assetType}-v1`)] = deepClone(definition); }
  }
  bundled.$defs = defs;
  return { schema: bundled };
}
