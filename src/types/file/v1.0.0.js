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

import { SRC_PATTERN } from '../asset.js';

// Identical to schemas/file/v1.0.0.json, the published file. A test keeps both in sync.
export default {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/file/v1.0.0.json',
  title: 'File',
  description: 'A file, such as a PDF, referenced by its source.',
  type: 'object',
  properties: {
    src: {
      type: 'string',
      title: 'Source',
      description: 'The http(s) URL or media bus path of the asset.',
      pattern: SRC_PATTERN,
    },
  },
  required: ['src'],
  additionalProperties: false,
};
