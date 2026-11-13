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

/**
 * The `x-semantic-type` values the SDK recognizes.
 * @type {Readonly<{ longText: 'long-text', richText: 'rich-text' }>}
 */
export const SEMANTIC_TYPES = Object.freeze({
  longText: 'long-text',
  richText: 'rich-text',
});

const KIND_BY_SEMANTIC_TYPE = new Map([
  [SEMANTIC_TYPES.longText, 'string'],
  [SEMANTIC_TYPES.richText, 'string'],
]);

/**
 * Whether the SDK supports a semantic type on a field of the given kind.
 * @param {object} options
 * @param {string} [options.semanticType] The field's `x-semantic-type` value.
 * @param {string} options.kind The field's JSON type, such as `string`.
 * @returns {boolean}
 */
export function isSupportedSemanticType({ semanticType, kind }) {
  return KIND_BY_SEMANTIC_TYPE.get(semanticType) === kind;
}
