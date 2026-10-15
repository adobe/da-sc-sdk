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

// Media values as EDS delivers them.

// EDS appends rendition parameters to media bus images, for example
// `./media_<hash>.jpg?width=750&format=jpg`. Media values keep the bare path
// so consumers choose their own rendition.
const MEDIA_BUS_PATH = /^(?:\.\/)?media_[0-9a-f]+\.[a-z0-9]+(?=[?#]|$)/i;

// Formats that the EDS media bus delivers as images.
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg']);

// Returns the normalized form of a media source. Whitespace is trimmed, and a
// media bus path drops EDS's size and format parameters, so
// `./media_ab12.jpg?width=750` becomes `./media_ab12.jpg`. Saving and loading
// both use this, so a value read back from a page equals the value saved.
export function normalizeMediaSource(src) {
  const trimmed = src.trim();
  return trimmed.match(MEDIA_BUS_PATH)?.[0] ?? trimmed;
}

// Resolves a media bus path against the URL of the page it was read from, the
// way a browser does, so `./media_ab12.jpg` on `https://<host>/folder/x`
// becomes `https://<host>/folder/media_ab12.jpg`. Other sources are returned
// unchanged.
export function toAbsoluteMediaUrl(src, base) {
  if (base && MEDIA_BUS_PATH.test(src)) {
    return new URL(src, base).href;
  }
  return src;
}

function pathOf(src) {
  const [path] = src.trim().split(/[?#]/);
  return path;
}

// The lowercase extension of the last path segment, or '' without one.
function extensionOf(path) {
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex !== -1 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
}

// Whether a media value is an image EDS can deliver, judged by the extension
// of its path. A value without an extension, such as an AEM video rendition
// or an image CDN URL, counts as a file. Saving a file as an image breaks it,
// while saving an image as a link still delivers it.
export function isMediaImage(src) {
  if (typeof src !== 'string') {
    return false;
  }
  return IMAGE_EXTENSIONS.has(extensionOf(pathOf(src)));
}
