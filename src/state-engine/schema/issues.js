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

/** The `reason` of each schema issue, the codes consumers branch on. */
export const ISSUE_REASONS = Object.freeze({
  missingType: 'missing-type',
  typeAsArray: 'type-as-array',
  unsupportedType: 'unsupported-type',
  unsupportedComposition: 'unsupported-composition',
  externalRef: 'external-ref',
  unresolvedRef: 'unresolved-ref',
  invalidPattern: 'invalid-pattern',
});

/** The message of an issue without a reason of its own. */
const UNSUPPORTED_MESSAGE = 'This schema construct is not supported.';

/** Builds the message of each issue from its `details`. */
const ISSUE_MESSAGES = new Map([
  [ISSUE_REASONS.missingType, () => 'A type is required.'],
  [ISSUE_REASONS.typeAsArray, () => 'The type must be a single value, not an array.'],
  [ISSUE_REASONS.unsupportedType, (details) => `The type "${details?.type ?? ''}" is not supported.`],
  [ISSUE_REASONS.unsupportedComposition, (details) => `Composition "${details?.keyword ?? ''}" is not supported.`],
  [ISSUE_REASONS.externalRef, (details) => `External reference "${details?.ref ?? ''}" is not supported; use a local "#/…" reference.`],
  [ISSUE_REASONS.unresolvedRef, (details) => `Reference "${details?.ref ?? ''}" could not be resolved.`],
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
