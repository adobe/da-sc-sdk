// Web Test Runner configuration for da-sc-sdk.
//
// The SDK is a self-contained package — this config is everything its
// tests need. `nodeResolve` lets wtr resolve bare specifiers from the
// SDK's own node_modules (`hast-util-from-html` for the HTML parser used
// in roundtrip tests, `@esm-bundle/chai` for assertions). Coverage is
// scoped to `src/`; thresholds enforce the SDK's quality bar.

import { readdirSync } from 'node:fs';

/**
 * Server command `list-shared-schemas`. Returns the path of every JSON file in
 * `schemas/shared/`, such as `/schemas/shared/image/v1.0.0.json`, because tests
 * in the browser can't list a folder.
 */
const listSharedSchemas = {
  name: 'list-shared-schemas',
  executeCommand({ command }) {
    if (command !== 'list-shared-schemas') {
      return undefined;
    }
    return readdirSync('schemas/shared', { recursive: true })
      .filter((file) => file.endsWith('.json'))
      .map((file) => `/schemas/shared/${file}`);
  },
};

export default {
  files: 'test/**/*.test.js',
  plugins: [listSharedSchemas],
  nodeResolve: true,
  coverage: true,
  coverageConfig: {
    include: ['src/**/*.js'],
    report: true,
    reportDir: 'coverage',
    threshold: { statements: 90, branches: 80, functions: 90, lines: 90 },
    reporters: ['text-summary', 'lcov'],
  },
};
