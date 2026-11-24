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

/** The file schema, version 1.0.0. */
export default {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://headless.adobe.net/schemas/shared/file/versions/1.0.0',
  title: 'File',
  description: 'A file, such as a PDF, referenced by its source.',
  type: 'object',
  properties: {
    src: {
      type: 'string',
      title: 'Source',
      description: 'The http(s) URL or media bus path of the asset.',
      pattern: String.raw`^\s*(?:\./|https?://)\S+\s*$`,
    },
  },
  required: ['src'],
  additionalProperties: false,
};
