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

/** The names of the shared schemas whose values are media, each with a source in `src`. */
export const MEDIA_SCHEMA_NAMES = Object.freeze({
  image: 'image',
  file: 'file',
});

/** The property of a media value that holds its source. */
export const MEDIA_SOURCE_PROPERTY = 'src';

/** The names of the shared schemas whose values are media. */
const MEDIA_SCHEMAS = new Set(Object.values(MEDIA_SCHEMA_NAMES));

/**
 * Whether a field holds the source of media, the `src` of an image or a file.
 * @param {object} options The field.
 * @param {string} [options.sharedSchemaName] The shared schema of the value that holds the field.
 * @param {string} options.propertyName The name of the field.
 * @returns {boolean} True for the source of media.
 */
export function isMediaSourceField({ sharedSchemaName, propertyName }) {
  return MEDIA_SCHEMAS.has(sharedSchemaName) && propertyName === MEDIA_SOURCE_PROPERTY;
}

/**
 * A media bus path such as `./media_1a2b.jpg`, optionally with rendition
 * parameters such as `?width=750`.
 */
const MEDIA_BUS_PATH = /^((?:\.\/)?media_[0-9a-f]+\.[a-z0-9]+)(?:[?#]\S*)?$/i;

/**
 * Parses a media bus path.
 * @param {string} source The source.
 * @returns {string | null} The path without rendition parameters, or null when
 *   the source isn't a media bus path.
 */
export function parseMediaBusPath(source) {
  return MEDIA_BUS_PATH.exec(source)?.[1] ?? null;
}

/**
 * Normalizes a media source the same way when it is written and when it is read,
 * so a value read back equals the value written. Whitespace is trimmed, and a
 * media bus path drops its rendition parameters.
 * @param {string} source The source.
 * @returns {string} The normalized source.
 */
export function normalizeMediaSource(source) {
  const trimmed = source.trim();
  return parseMediaBusPath(trimmed) ?? trimmed;
}
