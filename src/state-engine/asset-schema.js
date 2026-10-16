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

// The asset definitions. A schema declares an image field with
// `{ "$ref": IMAGE_SCHEMA_URL }` and a file field (a PDF, a document, …) with
// `{ "$ref": FILE_SCHEMA_URL }`. The SDK resolves those references to these
// definitions and never fetches them. The build writes them to the committed
// `schemas/image/v1.json` and `schemas/file/v1.json`, which the repository
// serves at their `$id`, and `bundleSchema` embeds them for validators that do
// not fetch references.
//
// A published version never changes: new properties go in a new version.

const SCHEMAS_BASE = 'https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas';

export const IMAGE_SCHEMA_URL = `${SCHEMAS_BASE}/image/v1.json`;
export const FILE_SCHEMA_URL = `${SCHEMAS_BASE}/file/v1.json`;

export const ASSET_SRC = 'src';
export const ASSET_ALT = 'altText';

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const SRC_PROPERTY = {
  type: 'string',
  title: 'Source',
  description: 'The URL or media path of the asset.',
};

export const IMAGE_SCHEMA = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: IMAGE_SCHEMA_URL,
  title: 'Image',
  description: 'An image, referenced by its source, with a text alternative.',
  type: 'object',
  properties: {
    [ASSET_SRC]: SRC_PROPERTY,
    [ASSET_ALT]: {
      type: 'string',
      title: 'Alt text',
      description: 'A text alternative for the image.',
    },
  },
  required: [ASSET_SRC],
  additionalProperties: false,
});

export const FILE_SCHEMA = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: FILE_SCHEMA_URL,
  title: 'File',
  description: 'A file, such as a PDF, referenced by its source.',
  type: 'object',
  properties: {
    [ASSET_SRC]: SRC_PROPERTY,
  },
  required: [ASSET_SRC],
  additionalProperties: false,
});

// Each definition with its asset type, which the model carries as `assetType`.
// `optionalRequired` lists the properties a schema may require next to the
// `$ref` with `required`.
const ASSETS = new Map([
  [IMAGE_SCHEMA_URL, { assetType: 'image', schema: IMAGE_SCHEMA, optionalRequired: [ASSET_ALT] }],
  [FILE_SCHEMA_URL, { assetType: 'file', schema: FILE_SCHEMA, optionalRequired: [] }],
]);

export const ASSET_SCHEMAS = Object.freeze([...ASSETS.values()].map(({ schema }) => schema));

export function assetDefinition(ref) {
  return ASSETS.get(ref);
}

export function isAssetRef(ref) {
  return ASSETS.has(ref);
}
