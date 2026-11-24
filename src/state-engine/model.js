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

import { DATA_POINTER, appendPointer } from '../shared/pointer.js';
import { isJsonObject } from '../shared/object.js';

/**
 * The fields every node has, read from its definition.
 * @param {object} definition The compiled definition of the field.
 * @param {string} pointer The pointer of the node.
 * @param {unknown} value The value at the pointer.
 * @returns {object} The common fields of the node.
 */
function commonFields(definition, pointer, value) {
  return {
    key: definition.key,
    kind: definition.kind,
    pointer,
    label: definition.label,
    required: !!definition.required,
    readonly: !!definition.readonly,
    defaultValue: definition.defaultValue,
    validation: definition.validation ?? {},
    value,
  };
}

/**
 * The fields a node has only when its definition sets them.
 * @param {object} definition The compiled definition of the field.
 * @returns {object} The optional fields that are set.
 */
function optionalFields(definition) {
  return {
    ...(definition.unsupported && { unsupported: definition.unsupported }),
    ...(definition.unsupportedComposition && {
      unsupportedComposition: definition.unsupportedComposition,
    }),
    ...(Array.isArray(definition.enumValues) && { enumValues: definition.enumValues }),
    ...(definition.semanticType && { semanticType: definition.semanticType }),
    ...(definition.sharedSchemaName && { sharedSchemaName: definition.sharedSchemaName }),
    ...(definition.additionalProperties === false && { additionalProperties: false }),
    ...(definition.format && { format: definition.format }),
    ...(definition.description !== undefined && { description: definition.description }),
  };
}

/**
 * Builds the child node of each property of an object.
 * @param {object} options The object and where it is.
 * @param {object} options.definition The compiled definition of the object.
 * @param {string} options.pointer The pointer of the object.
 * @param {unknown} options.value The object's value. Any other value counts as empty.
 * @param {object} options.byPointer Collects every node by its pointer.
 * @returns {object[]} The child nodes, in the order of the properties.
 */
function buildChildren({
  definition, pointer, value, byPointer,
}) {
  const object = isJsonObject(value) ? value : {};
  return (definition.children ?? []).map((child) => (
    // eslint-disable-next-line no-use-before-define
    buildNode({
      definition: child,
      pointer: appendPointer({ pointer, segment: child.key }),
      value: object[child.key],
      byPointer,
    })
  ));
}

/**
 * Builds the node of each item of an array.
 * @param {object} options The array and where it is.
 * @param {object} options.definition The compiled definition of the array.
 * @param {string} options.pointer The pointer of the array.
 * @param {unknown} options.value The array's value. Any other value counts as empty.
 * @param {object} options.byPointer Collects every node by its pointer.
 * @returns {object[]} The item nodes, in order.
 */
function buildItems({
  definition, pointer, value, byPointer,
}) {
  const array = Array.isArray(value) ? value : [];
  return array.map((item, index) => (
    // eslint-disable-next-line no-use-before-define
    buildNode({
      definition: definition.item,
      pointer: appendPointer({ pointer, segment: index }),
      value: item,
      byPointer,
    })
  ));
}

/**
 * Builds the node of a field and, for an object or array, its descendants.
 * Adds every node it builds to `byPointer`, children before their parent.
 * @param {object} options The field and where it is.
 * @param {object} options.definition The compiled definition of the field.
 * @param {string} options.pointer The pointer of the field.
 * @param {unknown} options.value The value at the pointer.
 * @param {object} options.byPointer Collects every node by its pointer.
 * @returns {object} The node.
 */
function buildNode({
  definition, pointer, value, byPointer,
}) {
  const fields = { ...commonFields(definition, pointer, value), ...optionalFields(definition) };
  const context = {
    definition, pointer, value, byPointer,
  };

  let node = fields;
  if (definition.kind === 'object') {
    node = { ...fields, children: buildChildren(context) };
  } else if (definition.kind === 'array') {
    node = {
      ...fields,
      minItems: definition.minItems,
      maxItems: definition.maxItems,
      itemLabel: definition.item?.label ?? '',
      items: buildItems(context),
    };
  }

  byPointer[pointer] = node;
  return node;
}

/**
 * Builds the model of a document from its compiled schema.
 *
 * The model keeps `document` as it is, so pass a copy the caller no longer
 * changes. `mutate.js` and `parseDocument` both pass a deep clone. `byPointer`
 * is a plain object rather than a Map, so the state stays serializable with
 * `JSON.stringify`.
 * @param {object} options The schema and the document.
 * @param {object | null} options.definition The compiled schema.
 * @param {object | null} [options.document] The document.
 * @returns {{ root: object, byPointer: object, document: object } | null} The
 *   model, or null without a definition.
 */
export function buildModel({ definition, document }) {
  if (!definition) { return null; }

  const modelDocument = document ?? {};
  const byPointer = {};
  const root = buildNode({
    definition,
    pointer: DATA_POINTER,
    value: modelDocument.data ?? {},
    byPointer,
  });

  return { root, byPointer, document: modelDocument };
}

/**
 * The node at a pointer.
 * @param {object} options The model and the pointer.
 * @param {object | null} options.model The model.
 * @param {string} options.pointer The pointer.
 * @returns {object | null} The node, or null if the model has none there.
 */
export function nodeAt({ model, pointer }) {
  return model?.byPointer?.[pointer] ?? null;
}
