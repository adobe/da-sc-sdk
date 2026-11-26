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

import { findSharedSchema } from './index.js';

/**
 * The shared schema with a name and version.
 * @param {{ name?: unknown, version?: unknown }} [options]
 * @returns {{ schema: object } | { error: string }}
 */
export function getSharedSchema({ name, version } = {}) {
  if (typeof name !== 'string' || typeof version !== 'string') {
    return { error: 'The name and version must be strings.' };
  }
  const schema = findSharedSchema({ name, version });
  return schema ? { schema } : { error: 'No shared schema has this name and version.' };
}
