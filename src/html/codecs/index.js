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

// Codecs write values as DA markup. Media sources and semantic types, such as
// `rich-text`, have codecs of their own. Everything else is text.
//
// A codec with `fromHtml` reads its value from a cell's nodes instead of from
// their text. Its markup is written into a block of its own, referenced with
// its semantic type, as `self://<semantic-type>#<key>-<id>`.

import { isMediaSourceField } from '../../types/media.js';
import { SEMANTIC_TYPES } from '../../types/semantic.js';
import media from './media.js';
import richText from './rich-text.js';
import text from './text.js';

/** The codecs of the semantic types whose values are not written as text. */
const CODECS_BY_SEMANTIC_TYPE = new Map([
  [SEMANTIC_TYPES.richText, richText],
]);

/**
 * Finds the codec that writes a value.
 * @param {object} options The value.
 * @param {object} [options.node] The model node of the value.
 * @param {object} [options.parentNode] The model node of the value that holds it.
 * @returns {object} The media codec for a media source, the codec of the value's
 *   semantic type, or the text codec.
 */
export function codecFor({ node, parentNode }) {
  const isMediaSource = isMediaSourceField({
    sharedSchemaName: parentNode?.sharedSchemaName,
    propertyName: node?.key,
  });
  if (isMediaSource) {
    return media;
  }
  return CODECS_BY_SEMANTIC_TYPE.get(node?.semanticType) ?? text;
}

/**
 * Finds the codec of a semantic type whose values are written as markup.
 * @param {string} semanticType The semantic type.
 * @returns {object | undefined} The codec, or undefined when the semantic type
 *   has none or its values are written as text.
 */
export function markupCodecFor(semanticType) {
  const codec = CODECS_BY_SEMANTIC_TYPE.get(semanticType);
  return codec?.fromHtml ? codec : undefined;
}
