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

import { findSharedSchemaById } from '../../types/index.js';

/**
 * Marks a resolved node as the value of a shared schema and holds its `$id`.
 * It is a symbol, so no schema can set it, because the compiler clones its
 * input and the clone drops symbol keys.
 */
export const SHARED_SCHEMA_REF = Symbol('sharedSchemaRef');

/** Keywords next to a shared schema `$ref` that describe the field, not the shared schema. */
const SHARED_SCHEMA_REF_ANNOTATIONS = ['title', 'description', 'readOnly', 'default'];

/**
 * The annotations the resolver keeps. `readonly` is the legacy spelling of
 * `readOnly`, which the compiler also reads.
 */
const KEPT_SHARED_SCHEMA_REF_ANNOTATIONS = [...SHARED_SCHEMA_REF_ANNOTATIONS, 'readonly'];

/** Keywords next to a shared schema `$ref` that leave the shared schema unchanged. */
const NON_CONSTRAINING_KEYWORDS = new Set([
  ...KEPT_SHARED_SCHEMA_REF_ANNOTATIONS, 'examples', 'deprecated', 'writeOnly',
]);

/**
 * The properties of a shared schema, which a schema may list in `required` next
 * to its `$ref`.
 * @param {string} reference The `$id` of the shared schema.
 * @returns {string[]} The property names.
 */
function requirablePropertiesOf(reference) {
  return Object.keys(findSharedSchemaById(reference)?.properties ?? {});
}

/**
 * Whether a keyword next to a shared schema `$ref` leaves the shared schema unchanged.
 * @param {string} key The keyword.
 * @returns {boolean} True for annotations, `$` keywords and `x-` keywords.
 */
function isNonConstraining(key) {
  return NON_CONSTRAINING_KEYWORDS.has(key) || key.startsWith('$') || key.startsWith('x-');
}

/**
 * Whether `required` next to a shared schema `$ref` lists only properties of the
 * shared schema, each once.
 * @param {unknown} required The `required` next to the `$ref`.
 * @param {string} reference The `$id` of the shared schema.
 * @returns {boolean} True when a schema may set it.
 */
function isAllowedSharedSchemaRequired(required, reference) {
  const allowed = requirablePropertiesOf(reference);
  return Array.isArray(required)
    && new Set(required).size === required.length
    && required.every((name) => allowed.includes(name));
}

/**
 * Whether a keyword next to a shared schema `$ref` would change the shared schema.
 * @param {object} options The keyword and its node.
 * @param {object} options.node The schema node with the `$ref`.
 * @param {string} options.key The keyword.
 * @param {string} options.reference The `$id` of the shared schema.
 * @returns {boolean} True when the keyword is set and would change the shared schema.
 */
function changesSharedSchema({ node, key, reference }) {
  if (node[key] === undefined || isNonConstraining(key)) {
    return false;
  }
  if (key === 'required') {
    return !isAllowedSharedSchemaRequired(node.required, reference);
  }
  return true;
}

/**
 * The keywords adjacent to a shared schema `$ref` that would change the shared
 * schema. JSON Schema validators apply them on top of the `$ref` target, so the
 * compiler reports them instead of dropping them silently.
 * @param {object} options The node to check.
 * @param {object} options.node The schema node with the `$ref`.
 * @param {string} options.reference The `$id` of the shared schema.
 * @returns {string[]} The keywords to remove, empty when there are none.
 */
export function unsupportedAdjacentKeywords({ node, reference }) {
  return Object.keys(node).filter((key) => changesSharedSchema({ node, key, reference }));
}

/**
 * Picks the defined values of some keys of a node.
 * @param {object} node A schema node.
 * @param {string[]} keys The keys to pick.
 * @returns {object} A new object with the keys whose values are defined.
 */
function pickDefined(node, keys) {
  return Object.fromEntries(keys
    .filter((key) => node[key] !== undefined)
    .map((key) => [key, node[key]]));
}

/**
 * Resolves a `$ref` to a shared schema into an object field. The SDK owns the
 * shared schema's shape, so only annotations and an allowed `required` are kept.
 * Check `unsupportedAdjacentKeywords` first.
 * @param {object} options The node to resolve.
 * @param {object} options.node The schema node with the `$ref`.
 * @param {string} options.reference The `$id` of the shared schema.
 * @param {string} options.schemaPath Where the node is in the schema.
 * @returns {object} The field, marked as the value of the shared schema.
 */
export function resolveSharedSchemaRef({ node, reference, schemaPath }) {
  return {
    ...pickDefined(node, KEPT_SHARED_SCHEMA_REF_ANNOTATIONS),
    ...(node.required && { required: [...node.required] }),
    type: 'object',
    [SHARED_SCHEMA_REF]: reference,
    schemaPath,
  };
}

/**
 * The keywords that may be adjacent to a shared schema `$ref`, as a schema would
 * write them.
 * @param {string} reference The `$id` of the shared schema.
 * @returns {string[]} The annotations, and `required` with the properties.
 */
export function allowedAdjacentKeywords(reference) {
  const requirable = JSON.stringify(requirablePropertiesOf(reference));
  return [...SHARED_SCHEMA_REF_ANNOTATIONS, `required: ${requirable}`];
}
