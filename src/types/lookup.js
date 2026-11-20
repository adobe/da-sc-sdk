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

import { SHARED_SCHEMAS, findSharedSchemaByPath } from './index.js';

/**
 * The shared schema at a path.
 * @param {{ path?: unknown }} [options]
 * @returns {{ schema: object } | { error: string }}
 */
export function getSharedSchemaByPath({ path } = {}) {
  if (typeof path !== 'string') {
    return { error: 'The path must be a string.' };
  }
  const schema = findSharedSchemaByPath(path);
  return schema ? { schema } : { error: 'No shared schema has this path.' };
}

/**
 * Every version of every shared schema.
 * @returns {{ schemas: readonly object[] }}
 */
export function getSharedSchemas() {
  return { schemas: SHARED_SCHEMAS };
}
