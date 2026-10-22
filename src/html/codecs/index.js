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
// DA markup. A new type adds its property codecs here. Everything else is text.

import { TYPES } from '../../types/index.js';
import { fileCodecs, imageCodecs } from './asset.js';
import text from './text.js';

const CODECS_BY_TYPE = new Map([
  [TYPES.image.name, imageCodecs],
  [TYPES.file.name, fileCodecs],
]);

export function codecFor({ parentNode, key }) {
  const codecs = CODECS_BY_TYPE.get(parentNode?.typeName);
  if (!codecs || !Object.hasOwn(codecs, key)) {
    return text;
  }
  return codecs[key];
}
