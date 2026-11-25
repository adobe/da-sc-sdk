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

// The public API of the SDK. Every public function takes no argument or one
// object argument, so optional parameters can be added without breaking callers.

/**
 * Creates a stateful engine for one schema and one document. It compiles the
 * schema, builds the model and validates the data, then applies mutations such
 * as `setField` and reports each new state.
 */
export { createEngine } from './state-engine/index.js';

/** Checks whether a schema can be compiled, and lists the issues when it can't. */
export { validateSchema } from './state-engine/index.js';

/**
 * Checks data against a schema. The errors are keyed by the pointer of the
 * value they belong to.
 */
export { validateData } from './state-engine/index.js';

/** Converts a document to DA HTML, as the editor saves it. */
export { convertJsonToHtml } from './html/json2html.js';

/** Converts DA HTML to a document. */
export { convertHtmlToJson } from './html/html2json.js';

/**
 * Finds a shared schema, such as an image, by its name and version. Schemas
 * reference shared schemas by their `$id`.
 */
export { getSharedSchema } from './types/lookup.js';
