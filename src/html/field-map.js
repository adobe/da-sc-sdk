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

// A field map describes the fields of a document by schema position, not by
// value position: `{ semanticType?, children?: Map<key, field>, item?: field }`.
//
// Why the writer needs it instead of reading the model directly:
//
// - Pruning shifts indexes. The model has one node per array item, keyed by
//   the item's index (`/gallery/2`). The writer prunes empty values first, so
//   `['', 'a.jpg']` is written as `['a.jpg']` and the model node of `a.jpg`
//   is at index 1, not 0. The writer cannot look nodes up by pointer.
// - The model only has semantic types on item nodes. Array nodes do not say
//   what their items are, so the type has to come from an item node.
// - One item is not enough. Nested fields can exist in some items only: if
//   chapter 0 has no slides and chapter 1 has some, only chapter 1 says that
//   slides are assets. Every item comes from the same item schema, so all
//   items merge into one `item` field that holds for any index.
//
// Performance: the map is built once per save, in one pass over the model, and
// each value then costs one lookup per key. Searching the model while writing
// (pooling the nodes of all items at each level) gives the same result, but
// repeats that search for every item: with 100 chapters of 100 slides, a save
// took 2 s instead of 8 ms. Making it fast needs a cache that amounts to this
// map, built lazily.

function merge(a, b) {
  if (!a) { return b; }
  if (!b) { return a; }
  const field = { ...a, ...b };
  if (a.children || b.children) {
    field.children = new Map(a.children);
    (b.children ?? new Map()).forEach((child, key) => {
      field.children.set(key, merge(field.children.get(key), child));
    });
  }
  if (a.item || b.item) { field.item = merge(a.item, b.item); }
  return field;
}

function fieldOf(node) {
  if (!node || typeof node !== 'object') { return null; }
  const field = {};
  if (typeof node.semanticType === 'string') { field.semanticType = node.semanticType; }
  if (Array.isArray(node.children)) {
    field.children = new Map(node.children.map((child) => [child.key, fieldOf(child)]));
  }
  if (Array.isArray(node.items)) {
    field.item = node.items.map(fieldOf).reduce(merge, null);
  }
  return field;
}

// The field map of a state-engine model (`engine.getState().model`), or null
// when `model` is not one.
export function fieldMap(model) {
  const root = model && typeof model === 'object' ? model.root : null;
  return root && typeof root === 'object' ? fieldOf(root) : null;
}
