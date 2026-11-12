// Web Test Runner configuration for da-sc-sdk.
//
// The SDK is a self-contained package — this config is everything its
// tests need. `nodeResolve` lets wtr resolve bare specifiers from the
// SDK's own node_modules (`hast-util-from-html` for the HTML parser used
// in roundtrip tests, `@esm-bundle/chai` for assertions). Coverage is
// scoped to `src/`; thresholds enforce the SDK's quality bar.

import { readdirSync } from 'node:fs';

// Lists the type files in `schemas/`, such as `image/v1.0.0.json`, for tests
// that check every one is registered.
const listSchemas = {
  name: 'list-schemas',
  executeCommand({ command }) {
    if (command !== 'list-schemas') {
      return undefined;
    }
    return readdirSync('schemas', { recursive: true })
      .filter((path) => path.endsWith('.json'));
  },
};

export default {
  files: 'test/**/*.test.js',
  plugins: [listSchemas],
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
