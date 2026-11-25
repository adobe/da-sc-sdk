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

import { isDataEmpty } from '../../shared/empty.js';
import { httpUrl } from '../../shared/url.js';
import { MEDIA_SCHEMA_NAMES, normalizeMediaSource } from '../../types/media.js';
import { escapeAttr, escapeText } from '../markup.js';

/** The property of an image that holds its alt text. */
const ALT_PROPERTY = 'alt';

/** The file extensions of the images a page can show. */
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg']);

/**
 * The path of a source, without its query or fragment.
 * @param {string} source The source.
 * @returns {string} The path.
 */
function pathOf(source) {
  const url = httpUrl(source);
  if (url) {
    return url.pathname;
  }
  const [path] = source.split(/[?#]/);
  return path;
}

/**
 * The extension of the last segment of a path.
 * @param {string} path The path.
 * @returns {string} The extension in lowercase, or an empty string without one.
 */
function extensionOf(path) {
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) {
    return '';
  }
  return fileName.slice(dotIndex + 1).toLowerCase();
}

/**
 * Whether a source is an image file, judged by the extension of its path. A
 * source without an extension, such as a video rendition, counts as another file.
 * @param {string} source A normalized source.
 * @returns {boolean} True for an image file.
 */
function isImageFile(source) {
  return IMAGE_EXTENSIONS.has(extensionOf(pathOf(source)));
}

/**
 * The alt text of an image. Empty alt text is written as none.
 * @param {object} imageNode The model node of the image.
 * @returns {string} The alt text, or an empty string.
 */
function altTextOf(imageNode) {
  const altText = imageNode.value[ALT_PROPERTY];
  if (typeof altText !== 'string' || isDataEmpty(altText)) {
    return '';
  }
  return altText;
}

/**
 * Whether a source is written as an image. Only an image field writes one, and
 * only for an image file, since a file written as an image breaks while an
 * image written as a link still works.
 * @param {object} options The source.
 * @param {string} options.source The normalized source.
 * @param {object} options.parentNode The model node of the value that holds it.
 * @returns {boolean} True when the source is written as `<img>`.
 */
function isWrittenAsImage({ source, parentNode }) {
  const isImageField = parentNode.sharedSchemaName === MEDIA_SCHEMA_NAMES.image;
  return isImageField && isImageFile(source);
}

function imageHtml({ source, altText }) {
  return `<img src="${escapeAttr(source)}" alt="${escapeAttr(altText)}">`;
}

function linkHtml(source) {
  return `<a href="${escapeAttr(source)}">${escapeText(source)}</a>`;
}

/**
 * Writes a media source as an image or a link. The writer checks the source
 * before, so it always matches the pattern of its shared schema here.
 * @param {object} options The value.
 * @param {string} options.value The source.
 * @param {object} options.parentNode The model node of the value that holds it.
 * @returns {string} The markup.
 */
function toHtml({ value, parentNode }) {
  const source = normalizeMediaSource(value);
  if (isWrittenAsImage({ source, parentNode })) {
    return imageHtml({ source, altText: altTextOf(parentNode) });
  }
  return linkHtml(source);
}

export default { toHtml };
