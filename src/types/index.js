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

import image from './image/v1.0.0.js';
import file from './file/v1.0.0.js';
import { latestByName } from './version.js';

// Types a schema references by URL, for example `{ "$ref": TYPE_URLS.image }`.
// Each type is a JS module identical to its published JSON file in `schemas/`.

// Types are identified by URLs under this base, never fetched. Published URLs must not change.
// Experimental until the types have a production domain. After that move, these URLs stay accepted.
export const GITHUB_TYPES_BASE = 'https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas';

// Every version of every type. A new version is imported and listed here.
const DEFINITIONS = [image, file];

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// The `$id` is `<GITHUB_TYPES_BASE>/<name>/<version>.json`, the file's path under `schemas/`.
function register(schema) {
  const path = schema.$id.slice(`${GITHUB_TYPES_BASE}/`.length);
  const [name, fileName] = path.split('/');
  return deepFreeze({
    name,
    version: fileName.replace(/\.json$/, ''),
    url: schema.$id,
    // What a schema may list in `required` next to the `$ref`, such as an image's `altText`.
    requirableProperties: Object.keys(schema.properties)
      .filter((key) => !schema.required.includes(key)),
    schema,
  });
}

// Every registered version of every type.
export const REGISTERED_TYPES = Object.freeze(DEFINITIONS.map(register));

// The latest version of every type by name, for example `TYPES.image.url`.
export const TYPES = latestByName(REGISTERED_TYPES);

// The URL of the latest version of every type by name, for example `TYPE_URLS.image`.
export const TYPE_URLS = Object.freeze(Object.fromEntries(
  Object.values(TYPES).map(({ name, url }) => [name, url]),
));

const REGISTERED_BY_URL = new Map(REGISTERED_TYPES.map((type) => [type.url, type]));

// The registered type for a URL, or undefined.
export function registeredType(url) {
  return REGISTERED_BY_URL.get(url);
}
