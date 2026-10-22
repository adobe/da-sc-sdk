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

import { escapeAttr, escapeText, textContent } from '../markup.js';
import {
  isIngestedImage, isMediaImage, isMediaSource, normalizeMediaSource,
} from '../media.js';
import { ASSET_SRC } from '../../types/asset.js';
import { isDataEmpty } from '../../shared/empty.js';

const ASSET_ALT = 'altText';

// A source that is no image is written as a link, since an image written as a
// link still works but a file written as an image breaks.
function isWrittenAsImage({ src, externalImagesAsLinks }) {
  return externalImagesAsLinks ? isIngestedImage(src) : isMediaImage(src);
}

// Blank alt text is left out on save, so it is written as no alt text.
function imageHtml({ src, altText }) {
  const alt = typeof altText === 'string' && !isDataEmpty(altText) ? altText : '';
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`;
}

function linkHtml(href) {
  return `<a href="${escapeAttr(href)}">${escapeText(href)}</a>`;
}

// A source that is not a media bus path or an http(s) URL is written as text.
function srcToHtml({
  value, parentValue, options, asImage,
}) {
  if (typeof value !== 'string') {
    return textContent(value);
  }
  const src = normalizeMediaSource(value);
  if (!isMediaSource(src)) {
    return textContent(value);
  }

  const { externalImagesAsLinks } = options;
  if (asImage && isWrittenAsImage({ src, externalImagesAsLinks })) {
    return imageHtml({ src, altText: parentValue[ASSET_ALT] });
  }
  return linkHtml(src);
}

// EDS copies images into the media bus, so an image's source is written as `<img>`.
export const imageCodecs = {
  [ASSET_SRC]: { toHtml: (context) => srcToHtml({ ...context, asImage: true }) },
};

// A file is written as a link, which EDS keeps.
export const fileCodecs = {
  [ASSET_SRC]: { toHtml: (context) => srcToHtml({ ...context, asImage: false }) },
};
