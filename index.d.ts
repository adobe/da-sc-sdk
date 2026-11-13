// TypeScript declarations for `da-sc-sdk`.
//
// Hand-maintained alongside `src/index.js`. If a public signature changes,
// update this file. The 5 public functions are at the bottom; supporting
// types are at the top.

// ─── Documents ─────────────────────────────────────────────────────────────

/**
 * A DA structured-content document. The shape the SDK loads, mutates, and
 * serializes. Always `{ metadata, data }`; `metadata.schemaName` identifies
 * the schema the document was authored against.
 */
export interface Document {
  metadata: {
    /** Identifies which schema this document was authored against. Required
     *  for `convertJsonToHtml` (becomes the outer block's class name). */
    schemaName: string;
    [key: string]: unknown;
  };
  /** The user-editable payload. Shape is determined by the schema. */
  data?: unknown;
}

/** RFC 6901 JSON Pointer into the document, rooted at `/data`. */
export type JsonPointer = string;

// ─── Schema issues (compile-time) ──────────────────────────────────────────

/** Reasons a schema cannot be fully compiled by the SDK. */
export type SchemaIssueReason =
  | 'unsupported-composition'   // allOf / oneOf / anyOf without sibling properties
  | 'unsupported-type'          // a `type` value the SDK doesn't model
  | 'type-as-array'             // `type: ['string', 'null']` (nullable types not supported)
  | 'missing-type'              // a node with no `type` declared
  | 'external-ref'              // a `$ref` that is neither `#/...` nor an asset definition URL
  | 'unresolved-ref'            // a `#/...` ref that doesn't resolve
  | 'type-ref-keywords'        // keywords next to a type `$ref` beyond annotations (and an image's `required: ["altText"]`)
  | 'invalid-pattern';          // a `pattern` value that isn't a valid regex

export interface SchemaIssue {
  /** Machine code for what's wrong — branch on this. */
  reason: SchemaIssueReason;
  /**
   * Human-readable summary of the issue, derived from `reason`/`details`.
   * Location-independent (add location from `schemaPath`/`pointer`).
   */
  message: string;
  /**
   * RFC 6901 pointer to the offending construct in the *schema source*, rooted
   * at the schema (`/`). `$ref`s are re-rooted at their target, so an issue
   * inside a `$def` points at the def (`/$defs/YearAchievement`) rather than the
   * inlined usage site. This is the location to fix.
   */
  schemaPath: string;
  /**
   * RFC 6901 pointer to where the issue manifests in a *data instance*, rooted
   * at `/data` (array positions as `0`, `$ref`s resolved away). The SDK's
   * canonical addressing — the same space the model and data errors use.
   */
  pointer: string;
  /**
   * Structured, reason-specific context.
   * `{ type }` for `type-as-array` and `unsupported-type`,
   * `{ keyword, variants }` for `unsupported-composition`,
   * `{ ref }` for `external-ref` and `unresolved-ref`,
   * `{ ref, properties }` for `type-ref-keywords`, with the keywords to remove,
   * `{ pattern }` for `invalid-pattern`,
   * `null` for `missing-type`.
   */
  details: {
    type?: string | string[];
    keyword?: 'allOf' | 'oneOf' | 'anyOf';
    variants?: number;
    ref?: string;
    pattern?: string;
    properties?: string[];
  } | null;
}

// ─── Validation errors (data-against-schema) ───────────────────────────────

/** JSON Schema keywords the SDK emits as validation errors. */
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
  | 'maxItems';

/**
 * A single validation error. Shape mirrors ajv's per-entry shape with two
 * deliberate deviations:
 *
 *   1. `schemaPath` is omitted (would leak schema structure).
 *   2. `required` errors are emitted at the CHILD pointer (where the missing
 *      field would be), not the parent. `params.missingProperty` names the
 *      missing field.
 */
export interface ValidationError {
  keyword: ValidationKeyword;
  /** RFC 6901 pointer into the data, rooted at `/data`. */
  instancePath: JsonPointer;
  /** Keyword-specific structured context (e.g. `{ limit: 3 }` for
   *  `minLength`, `{ allowedValues: [...] }` for `enum`). */
  params: Record<string, unknown>;
  /** Human-readable sentence. Capitalized, period-terminated. */
  message: string;
}

/**
 * Pointer-keyed map of validation errors. One error per pointer (the first
 * failing check wins). UI consumers do `errors[pointer]?.message`; agents
 * iterate via `Object.values(errors)`.
 */
export type ErrorsByPointer = Record<JsonPointer, ValidationError>;

// ─── Model (runtime tree) ──────────────────────────────────────────────────

/** Field kinds the SDK can model. */
export type NodeKind =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'unsupported';

export interface ModelNode {
  /** Schema property key (`"name"`, `"tags"`, `"0"`, …) or `"data"` at root. */
  key: string;
  kind: NodeKind;
  /** RFC 6901 pointer to this node's value, rooted at `/data`. */
  pointer: JsonPointer;
  /** schema.title or the key as fallback. */
  label: string;
  /** schema.description — field help text; present only when the schema sets it. */
  description?: string;
  required: boolean;
  readonly: boolean;
  defaultValue?: unknown;
  /** Picked subset of validation keywords from the schema. */
  validation: Record<string, unknown>;
  /** Current value from the document at this pointer. */
  value: unknown;
  // Object-kind extras:
  children?: ModelNode[];
  // Array-kind extras:
  items?: ModelNode[];
  minItems?: number;
  maxItems?: number;
  itemLabel?: string;
  // Primitives with `enum`:
  enumValues?: unknown[];
  // String primitives with `x-semantic-type` (vendor presentation hint):
  semanticType?: 'long-text' | 'rich-text';
  /**
   * Values of a `$ref` type, rendered by editors as one field. `typeRef` is the
   * URL of the version the schema references (`…/image/v1.0.0.json`).
   * @experimental The type URLs change once the types have a production domain.
   */
  typeRef?: TypeUrl;
  /**
   * The type's name, the same for every version.
   * @experimental
   */
  typeName?: TypeName;
  // Unsupported-kind extras:
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

export interface Model {
  root: ModelNode;
  /** Plain object keyed by JSON Pointer for O(1) lookup. */
  byPointer: Record<JsonPointer, ModelNode>;
  /** The normalized document the model was built from (do not mutate). */
  document: Document;
}

// ─── State (what getState / onChange callers see) ──────────────────────────

export interface EditorState {
  document: Document | null;
  model: Model | null;
  validation: { errors: ErrorsByPointer };
  schemaIssues: SchemaIssue[];
}

// ─── Engine (the object createEngine returns) ──────────────────────────────

export interface Engine {
  /** Returns the current state snapshot. Plain JSON, safe to `JSON.stringify`. */
  getState(): EditorState;

  /** Set a primitive value at `pointer`. */
  setField(pointer: JsonPointer, value: unknown): EditorState;

  /** Append a new item to the array at `pointer`. */
  addItem(pointer: JsonPointer): EditorState;

  /** Insert a new item BEFORE the item at `pointer`. */
  insertItem(pointer: JsonPointer): EditorState;

  /** Remove the item at `pointer`. */
  removeItem(pointer: JsonPointer): EditorState;

  /** Move an array item from `fromIndex` to `toIndex` within the array at `pointer`. */
  moveItem(pointer: JsonPointer, fromIndex: number, toIndex: number): EditorState;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Creates a schema-constrained JSON state engine. It compiles the schema,
 * parses the document and builds the model and validation synchronously.
 * To start over with another schema or document, create a new engine.
 *
 * @param options The engine input.
 * @param options.schema The JSON Schema the document follows.
 * @param options.document The document to edit, `{ metadata, data }`.
 * @param options.onChange Called after every mutation, not at creation. Read
 *   the state with `engine.getState()`.
 * @returns The engine, with `getState()` and the mutation methods.
 */
export function createEngine(options?: {
  schema?: unknown;
  document?: Document | null;
  onChange?: () => void;
}): Engine;

/**
 * Checks whether a schema is well-formed in the SDK's schema dialect, without
 * any data.
 *
 * @param options The validation input.
 * @param options.schema The JSON Schema to check.
 * @returns `valid` is true when `schemaIssues` is empty.
 */
export function validateSchema(options?: {
  schema: unknown;
}): { valid: boolean; schemaIssues: SchemaIssue[] };

/**
 * Validates data against a schema. Errors are keyed by pointer and shaped like
 * ajv errors without `schemaPath`. Data is only valid against a schema without
 * issues.
 *
 * @param options The validation input.
 * @param options.schema The JSON Schema.
 * @param options.data The data to validate, the `data` part of a document.
 * @returns `valid` is true when both `errors` and `schemaIssues` are empty.
 */
export function validateData(options?: {
  schema: unknown;
  data?: unknown;
}): { valid: boolean; errors: ErrorsByPointer; schemaIssues: SchemaIssue[] };

/**
 * Converts JSON to DA wire-format HTML, without empty values, as the editor
 * saves it. Symmetric pair with `convertHtmlToJson`.
 *
 * @param options The conversion input.
 * @param options.json The document to convert.
 * @param options.model The model from the same `getState()` as the document.
 *   With it, an asset's `src` is written as `<img>` with `altText` as `alt`, or
 *   as a link for files and for paths that are no JPEG, PNG, GIF, WebP, AVIF or
 *   SVG. Values of a semantic type are written in their stored form, see
 *   schema-spec.md. Without it, every value is written as text.
 * @param options.config.externalImagesAsLinks Writes images as links, like
 *   Canvas does for AEM Assets. Media bus images and DA uploads stay images.
 *   Defaults to `false`.
 * @returns `{ html }`, or `{ error }` for invalid JSON or a model of another
 *   schema or of other data.
 */
export function convertJsonToHtml(options: {
  json: Document;
  model?: Model | null;
  config?: {
    /** @experimental */
    externalImagesAsLinks?: boolean;
  };
}): { html: string } | { error: string };

/**
 * Converts DA wire-format HTML to JSON. Symmetric pair with `convertJsonToHtml`.
 * Each value reads as the text of its cell. An asset's `src` cell without text
 * reads as its image source, without rendition parameters. A
 * `self://<semantic-type>#…` reference reads with the codec of that type, see
 * schema-spec.md.
 *
 * @param options The conversion input.
 * @param options.html The DA wire-format HTML.
 * @param options.config.baseUrl The URL of a delivered EDS page. Media bus
 *   paths then come back as absolute URLs, resolved as a browser would.
 * @returns `{ json }`, or `{ error }` for empty or malformed HTML or a base URL
 *   that is not an absolute http(s) URL.
 */
export function convertHtmlToJson(options?: {
  html: string;
  config?: { baseUrl?: string };
}): { json: Document } | { error: string };

/**
 * Embeds each asset type the schema references under `$defs`, as
 * `da-<name>-<version>` with its `$id`, so validators that don't fetch
 * references can use the schema offline. The input is not modified, and
 * bundling twice changes nothing. The SDK itself doesn't need it.
 *
 * @param options The bundling input.
 * @param options.schema The JSON Schema to bundle.
 * @returns `{ schema }`, or `{ error }` when `schema` is not an object.
 * @experimental
 */
export function bundleSchema(options?: {
  schema: unknown;
}): { schema: Record<string, unknown> } | { error: string };

/**
 * The name of a type a schema can reference by URL.
 * @experimental
 */
export type TypeName = 'image' | 'file';

type TypesBase = 'https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas';

/**
 * The URL of every registered type version. A test keeps this list in sync with
 * the registry.
 * @experimental
 */
export type TypeUrl =
  | `${TypesBase}/image/v1.0.0.json`
  | `${TypesBase}/file/v1.0.0.json`;

/**
 * The URL of the latest version of every type by name, to declare an asset
 * field as `{ "$ref": TYPE_URLS.image }`.
 * @experimental The URLs change once the types have a production domain.
 */
export const TYPE_URLS: Readonly<Record<TypeName, TypeUrl>>;
