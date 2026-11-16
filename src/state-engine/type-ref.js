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

// Resolves a `$ref` to a type, such as an image or file asset, into a field. Keywords
// next to the `$ref` that would change the type are reported as a schema issue.

import { REGISTERED_TYPES, registeredType } from '../types/index.js';

// Keywords next to a type `$ref` that describe the field, not the type.
const TYPE_REF_ANNOTATIONS = ['title', 'description', 'readOnly', 'default'];

// `readonly` is the legacy spelling of `readOnly`, which the compiler also reads.
const KEPT_TYPE_REF_ANNOTATIONS = [...TYPE_REF_ANNOTATIONS, 'readonly'];

const NON_CONSTRAINING_KEYWORDS = new Set([
  ...KEPT_TYPE_REF_ANNOTATIONS, 'examples', 'deprecated', 'writeOnly',
]);

// Keys the resolver adds to a node it has already resolved.
const RESOLVER_MARKERS = new Set(['schemaPath', 'typeRef', 'unsupportedRef', 'unsupportedComposition']);

function requirablePropertiesOf(ref) {
  return registeredType(ref)?.requirableProperties ?? [];
}

function isNonConstraining(key) {
  return NON_CONSTRAINING_KEYWORDS.has(key) || RESOLVER_MARKERS.has(key)
    || key.startsWith('$') || key.startsWith('x-');
}

// `required` next to a type `$ref` may only list the properties the type lets
// a schema require (an image's `altText`), each once.
function isAllowedTypeRequired(required, ref) {
  const allowed = requirablePropertiesOf(ref);
  return Array.isArray(required) && required.length > 0
    && new Set(required).size === required.length
    && required.every((name) => allowed.includes(name));
}

function changesType({ node, key, ref }) {
  if (node[key] === undefined || isNonConstraining(key)) {
    return false;
  }
  if (key === 'required') {
    return !isAllowedTypeRequired(node.required, ref);
  }
  return true;
}

// JSON Schema validators apply keywords next to a `$ref` on top of its target.
// Anything that would change the type is reported instead of dropped silently.
export function typeRefIssue({ node, ref, schemaPath }) {
  const keywords = Object.keys(node).filter((key) => changesType({ node, key, ref }));
  if (!keywords.length) {
    return null;
  }

  return {
    ...node,
    $ref: undefined,
    unsupportedRef: { reason: 'type-ref-keywords', ref, properties: keywords },
    schemaPath,
  };
}

function pickDefined(node, keys) {
  return Object.fromEntries(keys
    .filter((key) => node[key] !== undefined)
    .map((key) => [key, node[key]]));
}

// The SDK owns a type's shape, so only annotations and an allowed `required` are kept.
export function resolveTypeRef({ node, ref, schemaPath }) {
  const issue = typeRefIssue({ node, ref, schemaPath });
  if (issue) {
    return issue;
  }

  return {
    ...pickDefined(node, KEPT_TYPE_REF_ANNOTATIONS),
    ...(node.required && { required: [...node.required] }),
    type: 'object',
    typeRef: ref,
    schemaPath,
  };
}

function quotedList(values) {
  return values.map((value) => `"${value}"`).join(', ');
}

// The keywords a schema may set next to the type's `$ref`, as it would write them.
function allowedKeywords(ref) {
  const requirable = requirablePropertiesOf(ref);
  if (!requirable.length) {
    return TYPE_REF_ANNOTATIONS;
  }
  return [...TYPE_REF_ANNOTATIONS, `required: ${JSON.stringify(requirable)}`];
}

const QUOTED_TYPE_URLS = quotedList(REGISTERED_TYPES.map(({ url }) => url));

export function externalRefMessage({ ref = '' } = {}) {
  return `External reference "${ref}" is not supported. Use a local "#/…" reference or a type URL (${QUOTED_TYPE_URLS}).`;
}

export function typeRefKeywordsMessage({ ref, properties = [] } = {}) {
  const typeName = registeredType(ref)?.name ?? 'type';
  const allowed = allowedKeywords(ref).join(', ');
  return `Only these keywords can be set next to the ${typeName} reference (${allowed}). Remove ${quotedList(properties)}.`;
}
