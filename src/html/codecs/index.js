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

// Codecs write the properties of a typed value, such as an image's `src`, as
// DA markup. A new type adds its property codecs here. A semantic type, such as
// `rich-text`, registers a codec for the whole value. Everything else is text.
//
// A codec with `fromHtml` reads its value from a cell's nodes instead of from
// their text. Its markup is written into a block of its own, referenced with
// its semantic type, as `self://<semantic-type>#<key>-<id>`.

import { TYPES } from '../../types/index.js';
import { SEMANTIC_TYPES } from '../../types/semantic.js';
import { fileCodecs, imageCodecs } from './asset.js';
import richText from './rich-text.js';
import text from './text.js';

const CODECS_BY_TYPE = new Map([
  [TYPES.image.name, imageCodecs],
  [TYPES.file.name, fileCodecs],
]);

const CODECS_BY_SEMANTIC_TYPE = new Map([
  [SEMANTIC_TYPES.richText, richText],
]);

// `node` is the value's model node, `parentNode` the node of the object holding it.
export function codecFor({ node, parentNode, key }) {
  const codecs = CODECS_BY_TYPE.get(parentNode?.typeName);
  if (codecs && Object.hasOwn(codecs, key)) {
    return codecs[key];
  }
  return CODECS_BY_SEMANTIC_TYPE.get(node?.semanticType) ?? text;
}

// The codec of a semantic type whose values are written as markup, if any.
export function markupCodecFor(semanticType) {
  const codec = CODECS_BY_SEMANTIC_TYPE.get(semanticType);
  return codec?.fromHtml ? codec : undefined;
}
