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

import { SHARED_SCHEMAS, findSharedSchemas, parseSharedSchemaName } from '../../types/index.js';
import { allowedAdjacentKeywords } from './shared.js';

/** The `reason` of each schema issue, the codes consumers branch on. */
export const ISSUE_REASONS = Object.freeze({
  missingType: 'missing-type',
  typeAsArray: 'type-as-array',
  unsupportedType: 'unsupported-type',
  unsupportedComposition: 'unsupported-composition',
  externalRef: 'external-ref',
  unresolvedRef: 'unresolved-ref',
  unsupportedAdjacentKeywords: 'unsupported-adjacent-keywords',
  invalidPattern: 'invalid-pattern',
});

/** The message of an issue without a reason of its own. */
const UNSUPPORTED_MESSAGE = 'This schema construct is not supported.';

/**
 * Quotes values for a message.
 * @param {string[]} values The values.
 * @returns {string} The values in double quotes, separated by commas.
 */
function quotedList(values) {
  return values.map((value) => `"${value}"`).join(', ');
}

/** The `$id` of the newest version of each shared schema, quoted for messages. */
const QUOTED_SHARED_SCHEMA_IDS = quotedList(
  findSharedSchemas({ newest: true }).map(({ $id }) => $id),
);

/** The name of every shared schema. */
const SHARED_SCHEMA_NAMES = new Set(SHARED_SCHEMAS.map(({ $id }) => parseSharedSchemaName($id)));

/**
 * The message of an `external-ref` issue. A `$ref` to a version of a known shared
 * schema that this SDK doesn't have is most likely a newer version, so the message
 * asks to update the SDK.
 * @param {object} [details] The details of the issue.
 * @param {string} [details.ref] The `$ref`.
 * @returns {string} The message.
 */
function externalRefMessage({ ref: reference = '' } = {}) {
  if (SHARED_SCHEMA_NAMES.has(parseSharedSchemaName(reference))) {
    return `Shared schema "${reference}" is not in this version of the SDK. Update @adobe/da-sc-sdk to use it.`;
  }
  return `External reference "${reference}" is not supported. Use a local "#/…" reference or a shared schema (${QUOTED_SHARED_SCHEMA_IDS}).`;
}

/**
 * The message of an `unsupported-adjacent-keywords` issue. It lists the keywords that
 * may be adjacent to the `$ref` and the ones to remove.
 * @param {object} [details] The details of the issue.
 * @param {string} [details.ref] The `$id` of the shared schema.
 * @param {string[]} [details.keywords] The keywords to remove.
 * @returns {string} The message.
 */
function adjacentKeywordsMessage({ ref: reference, keywords = [] } = {}) {
  const name = parseSharedSchemaName(reference) ?? 'shared schema';
  const allowed = allowedAdjacentKeywords(reference).join(', ');
  return `Only these keywords can be adjacent to the ${name} $ref (${allowed}). Remove ${quotedList(keywords)}.`;
}

/** Builds the message of each issue from its `details`. */
const ISSUE_MESSAGES = new Map([
  [ISSUE_REASONS.missingType, () => 'A type is required.'],
  [ISSUE_REASONS.typeAsArray, () => 'The type must be a single value, not an array.'],
  [ISSUE_REASONS.unsupportedType, (details) => `The type "${details?.type ?? ''}" is not supported.`],
  [ISSUE_REASONS.unsupportedComposition, (details) => `Composition "${details?.keyword ?? ''}" is not supported.`],
  [ISSUE_REASONS.externalRef, externalRefMessage],
  [ISSUE_REASONS.unresolvedRef, (details) => `Reference "${details?.ref ?? ''}" could not be resolved.`],
  [ISSUE_REASONS.unsupportedAdjacentKeywords, adjacentKeywordsMessage],
  [ISSUE_REASONS.invalidPattern, () => 'The pattern is not a valid regular expression.'],
]);

/**
 * A readable summary of an issue, without its location. It ends with a period,
 * like the messages of validation errors.
 * @param {object} issue The issue.
 * @param {string} issue.reason The reason of the issue.
 * @param {object | null} [issue.details] More about the issue.
 * @returns {string} The message.
 */
export function issueMessage({ reason, details }) {
  return ISSUE_MESSAGES.get(reason)?.(details) ?? UNSUPPORTED_MESSAGE;
}
