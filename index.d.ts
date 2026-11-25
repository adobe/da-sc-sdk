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

/**
 * Headless SDK for DA structured content. It edits and validates
 * schema-driven JSON documents, converts them to and from DA HTML, and
 * provides shared schemas that custom schemas can reference.
 *
 * @packageDocumentation
 */

// #region Documents

/**
 * A DA structured content document, the shape the SDK loads, changes and
 * writes. `metadata.schemaName` names the schema it follows, and `data` holds
 * the content.
 */
export interface Document {
  metadata: {
    /** The schema the document follows. */
    schemaName: string;
    [key: string]: unknown;
  };
  /** The content, shaped by the schema. */
  data?: unknown;
}

/** An RFC 6901 JSON Pointer into the document, rooted at `/data`. */
export type JsonPointer = string;

// #endregion

// #region Diagnostics

/** Why the SDK can't fully compile a schema. */
export type SchemaIssueReason =
  | 'unsupported-composition'   // `allOf`, `oneOf` or `anyOf` without sibling `properties`
  | 'unsupported-type'          // a `type` the SDK doesn't model
  | 'type-as-array'             // `type` as an array, such as `['string', 'null']`
  | 'missing-type'              // a node without `type`
  | 'external-ref'              // a `$ref` that is neither `#/...` nor a shared schema `$id`
  | 'unresolved-ref'            // a `#/...` `$ref` that points to nothing
  | 'unsupported-adjacent-keywords' // keywords adjacent to a shared schema `$ref` that would change it
  | 'invalid-pattern';          // a `pattern` that isn't a valid regular expression

/** A problem the SDK found in a schema. */
export interface SchemaIssue {
  /** What is wrong, as a stable code. */
  reason: SchemaIssueReason;
  /** A readable summary of the issue. `schemaPath` and `pointer` give its location. */
  message: string;
  /**
   * Where to fix the issue, as an RFC 6901 pointer into the schema. An issue
   * inside a `$defs` entry points at that entry, such as `/$defs/Address`,
   * not at the place that references it.
   */
  schemaPath: string;
  /**
   * Where the issue affects the data, as an RFC 6901 pointer rooted at `/data`,
   * with `$ref`s resolved and array items as `0`. The model and validation
   * errors use the same pointers.
   */
  pointer: string;
  /** More about the issue, or `null` for a missing type. */
  details: {
    /** The unsupported `type`. */
    type?: string | string[];
    /** The composition keyword. */
    keyword?: 'allOf' | 'oneOf' | 'anyOf';
    /** How many schemas the composition lists. */
    variants?: number;
    /** The `$ref` the issue is about. */
    ref?: string;
    /** The invalid `pattern`. */
    pattern?: string;
    /** The keywords adjacent to a shared schema `$ref` to remove. */
    keywords?: string[];
  } | null;
}

/** The JSON Schema keywords a validation error can be about. */
export type ValidationKeyword =
  | 'required'
  | 'type'
  | 'enum'
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'minimum'
  | 'maximum'
  | 'minItems'
  | 'maxItems'
  | 'additionalProperties';

/**
 * A validation error, shaped like an ajv error with two differences. It has
 * no `schemaPath`, so it doesn't reveal how the schema is built. A `required`
 * error sits at the pointer of the missing field rather than its parent, and
 * `params.missingProperty` names that field.
 */
export interface ValidationError {
  keyword: ValidationKeyword;
  /** Where the error is, as an RFC 6901 pointer rooted at `/data`. */
  instancePath: JsonPointer;
  /** Details for the keyword, such as `{ limit: 3 }` for `minLength` or
   *  `{ allowedValues }` for `enum`. */
  params: Record<string, unknown>;
  /** A readable sentence that ends with a period. */
  message: string;
}

/**
 * Validation errors by pointer, at most one per pointer from the first check
 * that fails. Read one with `errors[pointer]?.message`, or all of them with
 * `Object.values(errors)`.
 */
export type ErrorsByPointer = Record<JsonPointer, ValidationError>;

// #endregion

// #region Model

/** The kinds of field the SDK can model. */
export type NodeKind =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'unsupported';

/** A field of the document, as its schema describes it. */
export interface ModelNode {
  /** The property name or array index, such as `name` or `0`, or `data` at the root. */
  key: string;
  kind: NodeKind;
  /** RFC 6901 pointer to this node's value, rooted at `/data`. */
  pointer: JsonPointer;
  /** The schema's `title`, or the key if it has none. */
  label: string;
  /** The schema's `description`, set only when the schema has one. */
  description?: string;
  required: boolean;
  readonly: boolean;
  defaultValue?: unknown;
  /** The schema's validation keywords that apply to this field. */
  validation: Record<string, unknown>;
  /** The current value at `pointer`. */
  value: unknown;
  // Objects
  children?: ModelNode[];
  // Arrays
  items?: ModelNode[];
  minItems?: number;
  maxItems?: number;
  itemLabel?: string;
  // Fields with `enum`
  enumValues?: unknown[];
  // Strings with `x-semantic-type`
  semanticType?: 'long-text' | 'rich-text';
  /**
   * The name of the shared schema the field references, such as `image`, the
   * same in every version. Editors render such a field as one control,
   * although it is an object.
   */
  sharedSchemaName?: string;
  // Unsupported fields
  unsupported?: {
    reason: string;
    feature: string;
    compositionKeyword?: string;
    variants?: number;
    schemaPath?: string;
    details?: unknown;
  };
  unsupportedComposition?: {
    compositionKeyword: string;
    variants: number;
    schemaPath: string;
  };
}

/** The fields of a document, built from its schema. */
export interface Model {
  /** The node of `data`. */
  root: ModelNode;
  /** Every node by its pointer. */
  byPointer: Record<JsonPointer, ModelNode>;
  /** The normalized document the model was built from. Don't change it. */
  document: Document;
}

// #endregion

// #region State

/** The engine's state, as plain JSON. */
export interface EditorState {
  document: Document | null;
  model: Model | null;
  validation: { errors: ErrorsByPointer };
  schemaIssues: SchemaIssue[];
}

// #endregion

// #region Engine

/** Edits one document against one schema. Each change returns the new state. */
export interface Engine {
  /** Returns the current state. */
  getState(): EditorState;

  /** Sets the primitive value at `pointer`. */
  setField(pointer: JsonPointer, value: unknown): EditorState;

  /** Adds an item to the end of the array at `pointer`. */
  addItem(pointer: JsonPointer): EditorState;

  /** Inserts an item before the item at `pointer`. */
  insertItem(pointer: JsonPointer): EditorState;

  /** Removes the item at `pointer`. */
  removeItem(pointer: JsonPointer): EditorState;

  /** Moves the item at `fromIndex` to `toIndex` in the array at `pointer`. */
  moveItem(pointer: JsonPointer, fromIndex: number, toIndex: number): EditorState;
}

// #endregion

// #region Shared schemas

/** A shared schema, such as an image. Its `$id` is its public URL. */
export type SharedSchema = Readonly<Record<string, unknown>> & { readonly $id: string };

// #endregion

// #region Public API

/**
 * Creates an engine for a document and its schema. It compiles the schema,
 * reads the document, and builds the model and validation before it returns.
 * Read the initial state with `getState()`. For another document or schema,
 * create a new engine.
 */
export function createEngine(options?: {
  schema?: unknown;
  document?: Document | null;
  /** Called after each change, not at creation. Read the state with `getState()`. */
  onChange?: () => void;
}): Engine;

/**
 * Checks a schema against what the SDK supports, without any data. `valid` is
 * true when `schemaIssues` is empty.
 */
export function validateSchema(options?: {
  schema: unknown;
}): { valid: boolean; schemaIssues: SchemaIssue[] };

/**
 * Validates data against a schema. `errors` lists the data's errors by pointer,
 * and `schemaIssues` the schema's problems. `valid` is true only when both are
 * empty, because data can't be valid against a broken schema.
 */
export function validateData(options?: {
  schema: unknown;
  data?: unknown;
}): { valid: boolean; errors: ErrorsByPointer; schemaIssues: SchemaIssue[] };

/**
 * Converts a document to DA HTML as the editor saves it, without empty values.
 *
 * @param options The conversion input.
 * @param options.json The document to convert.
 * @param options.model The model from the same `getState()` as the document.
 *   It decides how each value is written, such as a semantic type in its
 *   stored form, see schema-spec.md. Without it, every value is written as
 *   text.
 * @returns `{ html }`, or `{ error }` for invalid JSON, a model of another
 *   schema or of other data, or a media source that can't be written.
 */
export function convertJsonToHtml(options: {
  json: Document;
  model?: Model | null;
}): { html: string } | { error: string };

/**
 * Converts DA HTML to a document. Each value reads as the text of its cell,
 * and a `self://<semantic-type>#…` reference reads with the codec of that
 * type, see schema-spec.md.
 *
 * @param options The conversion input.
 * @param options.html The DA HTML.
 * @returns `{ json }`, or `{ error }` for empty or malformed HTML.
 */
export function convertHtmlToJson(options?: {
  html: string;
}): { json: Document } | { error: string };

/**
 * Returns the shared schema with a name and version.
 *
 * @param options The lookup input.
 * @param options.name The name, such as `image`.
 * @param options.version The version, such as `1.0.0`.
 * @returns `{ schema }`, or `{ error }` when no shared schema has this name and
 *   version, or either is not a string.
 */
export function getSharedSchema(options?: {
  name: string;
  version: string;
}): { schema: SharedSchema } | { error: string };

// #endregion
