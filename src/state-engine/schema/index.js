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

import { deepClone } from '../../shared/clone.js';
import { DATA_POINTER, appendPointer } from '../../shared/pointer.js';
import { findSharedSchemaById, parseSharedSchemaName } from '../../types/index.js';
import { isSupportedSemanticType } from '../../types/semantic.js';
import { ISSUE_REASONS, issueMessage } from './issues.js';
import {
  SHARED_SCHEMA_REF, resolveSharedSchemaRef, unsupportedAdjacentKeywords,
} from './shared.js';

function unionRequired(base = [], next = []) {
  return Array.from(new Set([...(base ?? []), ...(next ?? [])]));
}

function mergeSchemas(baseSchema = {}, nextSchema = {}) {
  const merged = { ...baseSchema, ...nextSchema };

  const baseProps = baseSchema?.properties ?? null;
  const nextProps = nextSchema?.properties ?? null;
  if (baseProps || nextProps) {
    merged.properties = { ...(baseProps ?? {}), ...(nextProps ?? {}) };
  }

  const baseDefs = baseSchema?.$defs ?? null;
  const nextDefs = nextSchema?.$defs ?? null;
  if (baseDefs || nextDefs) {
    merged.$defs = { ...(baseDefs ?? {}), ...(nextDefs ?? {}) };
  }

  merged.required = unionRequired(baseSchema.required, nextSchema.required);
  return merged;
}

function resolveRef({ ref, rootSchema }) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) { return null; }
  const segments = ref.slice(2).split('/').filter(Boolean);
  let current = rootSchema;
  for (const segment of segments) {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current == null || typeof current !== 'object') { return null; }
    current = current[key];
  }
  return current ?? null;
}

function escapeSchemaPathSegment(segment) {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

// Append a suffix to a schema path without doubling the separator at the root
// (`/` + `/items` would otherwise be `//items`).
function joinSchemaPath(base, suffix) {
  return base === '/' ? `/${suffix}` : `${base}/${suffix}`;
}

function markUnsupportedComposition({
  node, compositionKeyword, variants, schemaPath,
}) {
  return {
    ...node,
    unsupportedComposition: { compositionKeyword, variants, schemaPath },
  };
}

/**
 * Marks a node as an unsupported reference when keywords adjacent to its shared
 * schema `$ref` would change the shared schema.
 * @param {object} options The node to check.
 * @param {object} options.node The schema node with the `$ref`.
 * @param {string} options.reference The `$id` of the shared schema.
 * @param {string} options.schemaPath Where the node is in the schema.
 * @returns {object | null} The marked node, or null when every adjacent keyword is allowed.
 */
function adjacentKeywordsIssue({ node, reference, schemaPath }) {
  const keywords = unsupportedAdjacentKeywords({ node, reference });
  if (!keywords.length) {
    return null;
  }
  return {
    ...node,
    $ref: undefined,
    unsupportedRef: { reason: ISSUE_REASONS.unsupportedAdjacentKeywords, ref: reference, keywords },
    schemaPath,
  };
}

function resolveNode({
  node, rootSchema, seenRefs, schemaPath,
}) {
  if (!node || typeof node !== 'object') { return node; }

  let resolved = { ...node };
  // The schema-source location for this node. When a `$ref` resolves, we
  // re-root here at the ref target (`#/$defs/Foo` → `/$defs/Foo`) so issues
  // point at the `$def` the author wrote, not the inlined usage site.
  let effectivePath = schemaPath;

  if (resolved.$ref) {
    const ref = resolved.$ref;
    const isInternal = typeof ref === 'string' && ref.startsWith('#/');

    if (findSharedSchemaById(ref)) {
      return adjacentKeywordsIssue({ node: resolved, reference: ref, schemaPath })
        ?? resolveSharedSchemaRef({ node: resolved, reference: ref, schemaPath });
    }

    if (!isInternal) {
      // External ref (URL, file path, or malformed). docs/schema-spec.md only
      // permits same-document `#/...` refs.
      return {
        ...resolved,
        $ref: undefined,
        unsupportedRef: { reason: ISSUE_REASONS.externalRef, ref },
        schemaPath,
      };
    }

    if (seenRefs.has(ref)) {
      // Cycle: drop the ref and continue resolving the partial node we have.
      resolved = { ...resolved, $ref: undefined };
    } else {
      const target = resolveRef({ ref, rootSchema });
      if (!target) {
        // Internal but the pointer does not resolve in the document.
        return {
          ...resolved,
          $ref: undefined,
          unsupportedRef: { reason: ISSUE_REASONS.unresolvedRef, ref },
          schemaPath,
        };
      }
      seenRefs.add(ref);
      effectivePath = ref.slice(1);
      const derefTarget = resolveNode({
        node: deepClone(target), rootSchema, seenRefs, schemaPath: effectivePath,
      });
      seenRefs.delete(ref);
      if (derefTarget?.[SHARED_SCHEMA_REF]) {
        // A `#/$defs/...` entry can point to a shared schema, so check the keywords
        // adjacent to the local `$ref` as well.
        const usageIssue = adjacentKeywordsIssue({
          node: resolved, reference: derefTarget[SHARED_SCHEMA_REF], schemaPath,
        });
        if (usageIssue) {
          return usageIssue;
        }
      }
      resolved = mergeSchemas(derefTarget, { ...resolved, $ref: undefined });
    }
  }

  const composition = (
    (Array.isArray(resolved.allOf) && resolved.allOf.length > 0 && { key: 'allOf', entries: resolved.allOf })
    || (Array.isArray(resolved.oneOf) && resolved.oneOf.length > 0 && { key: 'oneOf', entries: resolved.oneOf })
    || (Array.isArray(resolved.anyOf) && resolved.anyOf.length > 0 && { key: 'anyOf', entries: resolved.anyOf })
  );

  if (composition) {
    // All composition keywords are unsupported per docs/schema-spec.md. If the
    // node also has a direct `properties` map, mark the node and fall through
    // so the editable subset still renders; otherwise the whole node becomes
    // kind 'unsupported'.
    const hasDirectProperties = resolved.properties
      && typeof resolved.properties === 'object'
      && !Array.isArray(resolved.properties)
      && Object.keys(resolved.properties).length > 0;

    resolved = markUnsupportedComposition({
      node: resolved,
      compositionKeyword: composition.key,
      variants: composition.entries.length,
      schemaPath: effectivePath,
    });

    if (!hasDirectProperties) {
      // Only the first (ref-aware) pass sets the path; a redundant re-resolve of
      // an already-dereferenced subtree must not clobber a re-rooted $def path.
      resolved.schemaPath ??= effectivePath;
      return resolved;
    }

    resolved = { ...resolved, allOf: undefined, oneOf: undefined, anyOf: undefined };
  }

  if (resolved.items) {
    resolved.items = resolveNode({
      node: resolved.items,
      rootSchema,
      seenRefs,
      schemaPath: joinSchemaPath(effectivePath, 'items'),
    });
  }

  if (resolved.properties && typeof resolved.properties === 'object') {
    resolved.properties = Object.fromEntries(
      Object.entries(resolved.properties).map(([key, propertySchema]) => [
        key,
        resolveNode({
          node: propertySchema,
          rootSchema,
          seenRefs,
          schemaPath: joinSchemaPath(effectivePath, `properties/${escapeSchemaPathSegment(key)}`),
        }),
      ]),
    );
  }

  // Preserve a path set on a deeper (ref-aware) pass; only stamp if unset.
  resolved.schemaPath ??= effectivePath;
  return resolved;
}

function resolveSchema(schema) {
  if (!schema || typeof schema !== 'object') { return null; }

  const clone = deepClone(schema);
  const resolved = resolveNode({
    node: clone,
    rootSchema: clone,
    seenRefs: new Set(),
    schemaPath: '/',
  });

  return { schema: resolved };
}

const RULE_NAMES = ['minLength', 'maxLength', 'minimum', 'maximum', 'pattern'];

function pickValidation(schema = {}) {
  return RULE_NAMES.reduce((acc, name) => {
    if (schema[name] !== undefined) { acc[name] = schema[name]; }
    return acc;
  }, {});
}

function getDefaults({ schema = {}, kind }) {
  return {
    readonly: !!(schema.readOnly ?? schema.readonly),
    defaultValue: schema.default,
    description: schema.description,
    validation: pickValidation(schema),
    minItems: kind === 'array' ? schema.minItems : undefined,
    maxItems: kind === 'array' ? schema.maxItems : undefined,
  };
}

const SUPPORTED_TYPES = new Set([
  'string', 'number', 'integer', 'boolean', 'object', 'array',
]);

// Native JSON Schema string `format` values we surface to the UI as date/time
// widgets. Standard RFC 3339 keywords — no proprietary hint needed. Carried onto
// the node only when the field is a string; any other format value is dropped.
const DATE_FORMATS = new Set(['date', 'date-time', 'time']);

function unsupportedKind({ reason, feature, schemaPath = '/', variants = 0, details = null }) {
  return {
    kind: 'unsupported',
    unsupported: {
      reason,
      feature,
      compositionKeyword: feature,
      variants,
      schemaPath,
      details,
    },
  };
}

function inferKind(schema = {}) {
  if (schema?.unsupportedRef) {
    const { reason, ref: reference, keywords } = schema.unsupportedRef;
    return unsupportedKind({
      reason,
      feature: reason,
      details: { ref: reference, ...(keywords && { keywords }) },
    });
  }

  if (schema?.unsupportedComposition) {
    // If the node also has directly-defined properties, compile it as an object.
    // The composition itself is flagged via unsupportedComposition; the
    // editable subset still renders.
    if (
      schema.properties
      && typeof schema.properties === 'object'
      && !Array.isArray(schema.properties)
    ) {
      return { kind: 'object' };
    }

    const u = schema.unsupportedComposition ?? {};
    const keyword = u.compositionKeyword ?? 'unknown';
    return unsupportedKind({
      reason: ISSUE_REASONS.unsupportedComposition,
      feature: keyword,
      variants: u.variants ?? 0,
      schemaPath: u.schemaPath ?? '/',
    });
  }

  if (Array.isArray(schema?.type)) {
    return unsupportedKind({
      reason: ISSUE_REASONS.typeAsArray,
      feature: ISSUE_REASONS.typeAsArray,
      details: { type: schema.type },
    });
  }

  if (typeof schema?.type === 'string') {
    if (SUPPORTED_TYPES.has(schema.type)) { return { kind: schema.type }; }
    return unsupportedKind({
      reason: ISSUE_REASONS.unsupportedType,
      feature: schema.type,
      details: { type: schema.type },
    });
  }

  return unsupportedKind({
    reason: ISSUE_REASONS.missingType,
    feature: ISSUE_REASONS.missingType,
  });
}

/**
 * Compiles the properties of an object into its child nodes.
 * @param {object} options The properties and where they are.
 * @param {object} options.properties The schema of each property by name.
 * @param {string[]} options.required The names of the required properties.
 * @param {string} options.pointer The pointer of the object.
 * @param {object[]} options.issues Collects the schema issues.
 * @returns {object[]} The child nodes, in the order of the properties.
 */
function compileChildren({
  properties, required, pointer, issues,
}) {
  const requiredSet = new Set(required);
  return Object.entries(properties).map(([childKey, childSchema]) => (
    // eslint-disable-next-line no-use-before-define
    compileNode({
      key: childKey,
      schema: childSchema ?? {},
      required: requiredSet.has(childKey),
      labelFallback: childKey,
      pointer: appendPointer({ pointer, segment: childKey }),
      issues,
    })
  ));
}

function compileNode({
  key, schema, required = false, labelFallback = '', pointer = DATA_POINTER, issues,
}) {
  const { kind, unsupported: inferred = null } = inferKind(schema);
  const label = schema?.title ?? labelFallback ?? key ?? '';
  const defaults = getDefaults({ schema, kind });
  // Where this node lives in the schema source (refs resolved to their $def).
  const schemaPath = schema?.schemaPath ?? '/';

  // Validate `pattern` at compile time. ajv treats an unparseable pattern as a
  // schema error (thrown at compile time, never reaches data validation); we
  // mirror that by surfacing it on `schemaIssues` and dropping it from the
  // node's `validation` so the data validator won't try to use it.
  if (typeof schema?.pattern === 'string' && defaults.validation.pattern !== undefined) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(schema.pattern);
    } catch {
      const details = { pattern: schema.pattern };
      issues.push({
        reason: ISSUE_REASONS.invalidPattern,
        message: issueMessage({ reason: ISSUE_REASONS.invalidPattern, details }),
        schemaPath,
        pointer,
        details,
      });
      delete defaults.validation.pattern;
    }
  }

  const base = {
    key,
    kind,
    label,
    required,
    readonly: defaults.readonly,
    defaultValue: defaults.defaultValue,
    description: defaults.description,
    validation: defaults.validation,
  };

  if (kind === 'unsupported') {
    const u = inferred ?? {};
    const keyword = u.compositionKeyword ?? 'unknown';
    const reason = u.reason ?? 'unsupported-schema-feature';
    const feature = u.feature ?? keyword;
    // Composition folds its keyword + branch count into details; every other
    // reason keeps its own details blob ({ type } / { ref } / null).
    const issueDetails = reason === ISSUE_REASONS.unsupportedComposition
      ? { keyword, variants: u.variants ?? 0 }
      : (u.details ?? null);
    issues.push({
      reason,
      message: issueMessage({ reason, details: issueDetails }),
      schemaPath,
      pointer,
      details: issueDetails,
    });

    return {
      ...base,
      kind: 'unsupported',
      readonly: true,
      unsupported: {
        compositionKeyword: keyword,
        feature,
        reason,
        variants: u.variants ?? 0,
        schemaPath,
        details: u.details ?? null,
      },
    };
  }

  // A shared schema value's properties come from the shared schema. What the
  // shared schema requires and what the schema adds next to the `$ref` are both required.
  const sharedSchemaRef = schema?.[SHARED_SCHEMA_REF];
  if (sharedSchemaRef) {
    const sharedSchema = findSharedSchemaById(sharedSchemaRef);
    return {
      ...base,
      sharedSchemaName: parseSharedSchemaName(sharedSchemaRef),
      children: compileChildren({
        properties: sharedSchema.properties ?? {},
        required: [...(sharedSchema.required ?? []), ...(schema.required ?? [])],
        pointer,
        issues,
      }),
    };
  }

  if (kind === 'object') {
    if (schema?.unsupportedComposition) {
      const u = schema.unsupportedComposition;
      const keyword = u.compositionKeyword ?? 'unknown';
      const details = { keyword, variants: u.variants ?? 0 };
      issues.push({
        reason: ISSUE_REASONS.unsupportedComposition,
        message: issueMessage({ reason: ISSUE_REASONS.unsupportedComposition, details }),
        schemaPath,
        pointer,
        details,
      });
    }

    const node = {
      ...base,
      children: compileChildren({
        properties: schema?.properties ?? {},
        required: schema?.required ?? [],
        pointer,
        issues,
      }),
    };

    if (schema?.unsupportedComposition) {
      node.unsupportedComposition = schema.unsupportedComposition;
    }

    return node;
  }

  if (kind === 'array') {
    const itemSchema = schema?.items ?? {};
    return {
      ...base,
      minItems: defaults.minItems,
      maxItems: defaults.maxItems,
      item: compileNode({
        key: 'item',
        schema: itemSchema,
        required: false,
        labelFallback: itemSchema?.title ?? label,
        pointer: appendPointer({ pointer, segment: 0 }),
        issues,
      }),
    };
  }

  if (Array.isArray(schema?.enum)) {
    return { ...base, enumValues: schema.enum };
  }

  if (kind === 'string' && DATE_FORMATS.has(schema?.format)) {
    return { ...base, format: schema.format };
  }

  // Vendor hint; `enum` and the standard `format` keyword take precedence above.
  // An unknown hint, or one for another kind, is dropped so consumers never
  // receive a hint they can't act on.
  if (isSupportedSemanticType({ semanticType: schema?.['x-semantic-type'], kind })) {
    return { ...base, semanticType: schema['x-semantic-type'] };
  }

  return base;
}

export function compileSchema(rawSchema) {
  const resolved = resolveSchema(rawSchema);
  if (!resolved?.schema) {
    return {
      schema: null,
      definition: null,
      editable: false,
      issues: [],
    };
  }

  const issues = [];
  const definition = compileNode({
    key: 'data',
    schema: resolved.schema,
    required: false,
    labelFallback: resolved.schema.title ?? 'Data',
    pointer: DATA_POINTER,
    issues,
  });

  return {
    schema: resolved.schema,
    definition,
    editable: issues.length === 0,
    issues,
  };
}
