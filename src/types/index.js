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

import { deepFreeze } from '../shared/freeze.js';
import schemas from './shared/index.js';

/** The origin of every shared schema `$id`, which is this origin plus the schema's path. */
export const ORIGIN = 'https://headless.adobe.net';

/** The folder of every shared schema path. */
const PATH_PREFIX = '/schemas/shared';

/** The form of a shared schema path. */
const PATH_FORM = `${PATH_PREFIX}/<name>/versions/<major>.<minor>.<patch>`;

/** A shared schema path. */
const PATH = /^\/schemas\/shared\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/versions\/(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

/** The longest name da-sc serves. */
const MAX_NAME_LENGTH = 64;

/**
 * The path of a URL on the shared schema origin.
 * @param {unknown} id A URL.
 * @returns {string | undefined} The path, or undefined for another URL.
 */
function pathOfId(id) {
  return typeof id === 'string' && id.startsWith(ORIGIN) ? id.slice(ORIGIN.length) : undefined;
}

/**
 * The path of a shared schema's `$id`.
 * @param {{ $id?: unknown }} schema A shared schema.
 * @returns {string} The path.
 * @throws {Error} On an `$id` that is not a shared schema URL, or a name that is too long.
 */
function pathOf({ $id }) {
  const path = pathOfId($id) ?? '';
  const name = PATH.exec(path)?.[1];
  if (!name) {
    throw new Error(`Shared schema $id ${$id} is not ${ORIGIN}${PATH_FORM}.`);
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Shared schema name ${name} is longer than ${MAX_NAME_LENGTH} characters.`);
  }
  return path;
}

/**
 * Freezes shared schemas and maps each by the path of its `$id`.
 * @param {object[]} versions Every version of every shared schema.
 * @returns {Map<string, object>} The schemas by path.
 * @throws {Error} On an `$id` that is not a shared schema URL, a name that is too
 *   long, or a duplicate.
 */
export function registerSharedSchemas(versions) {
  const byPath = new Map();
  versions.forEach((schema) => {
    const path = pathOf(schema);
    if (byPath.has(path)) {
      throw new Error(`Shared schema $id ${schema.$id} is registered twice.`);
    }
    byPath.set(path, deepFreeze(schema));
  });
  return byPath;
}

/** Every version of every shared schema by path. */
const BY_PATH = registerSharedSchemas(schemas);

/** Every version of every shared schema. */
export const SHARED_SCHEMAS = Object.freeze([...BY_PATH.values()]);

/**
 * The shared schema at a path.
 * @param {string} path The path of the schema's `$id`.
 * @returns {object | undefined} The schema, or undefined.
 */
export function findSharedSchemaByPath(path) {
  return BY_PATH.get(path);
}

/**
 * The shared schema with a name and version.
 * @param {object} options The name and version.
 * @param {string} options.name The name, such as `image`.
 * @param {string} options.version The version, such as `1.0.0`.
 * @returns {object | undefined} The schema, or undefined.
 */
export function findSharedSchema({ name, version }) {
  return findSharedSchemaByPath(`${PATH_PREFIX}/${name}/versions/${version}`);
}

/**
 * The shared schema whose `$id` is `id`.
 * @param {unknown} id A URL.
 * @returns {object | undefined} The schema, or undefined.
 */
export function findSharedSchemaById(id) {
  const path = pathOfId(id);
  return path === undefined ? undefined : findSharedSchemaByPath(path);
}

/**
 * Parses the name from a URL in the form of a shared schema `$id`. It reads only
 * the URL, so it also works for versions this SDK doesn't have yet.
 * @param {unknown} id A URL.
 * @returns {string | undefined} The name, or undefined for another URL.
 */
export function parseSharedSchemaName(id) {
  const path = pathOfId(id);
  return path === undefined ? undefined : PATH.exec(path)?.[1];
}

/**
 * Compares two shared schemas by version, numerically, so 1.10.0 is newer
 * than 1.9.0.
 * @param {{ $id: string }} a A shared schema.
 * @param {{ $id: string }} b Another shared schema.
 * @returns {number} Negative when the first is older, 0 when equal, positive when newer.
 */
export function compareSharedSchemaVersions(a, b) {
  const versionOf = ({ $id }) => $id.slice($id.lastIndexOf('/') + 1);
  return versionOf(a).localeCompare(versionOf(b), 'en', { numeric: true });
}

/**
 * The newest version of each shared schema among some versions.
 * @param {object[]} versions Shared schemas.
 * @returns {object[]} One shared schema per name, in the order the names first appear.
 */
export function getNewestVersions(versions) {
  const newestByName = new Map();
  versions.forEach((schema) => {
    const name = parseSharedSchemaName(schema.$id);
    const current = newestByName.get(name);
    if (!current || compareSharedSchemaVersions(schema, current) > 0) {
      newestByName.set(name, schema);
    }
  });
  return [...newestByName.values()];
}

/**
 * The shared schemas, in the order of the registry.
 * @param {object} [options] Which shared schemas to return.
 * @param {string} [options.name] Only the versions of this shared schema, such as `image`.
 * @param {boolean} [options.newest] Only the newest version of each shared schema.
 * @returns {object[]} The shared schemas.
 */
export function findSharedSchemas({ name, newest = false } = {}) {
  const nameOf = ({ $id }) => parseSharedSchemaName($id);
  const named = SHARED_SCHEMAS.filter((schema) => name === undefined || nameOf(schema) === name);
  return newest ? getNewestVersions(named) : named;
}
