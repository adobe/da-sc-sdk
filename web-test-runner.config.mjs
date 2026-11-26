// Web Test Runner configuration for da-sc-sdk.
//
// The SDK is a self-contained package — this config is everything its
// tests need. `nodeResolve` lets wtr resolve bare specifiers from the
// SDK's own node_modules (`hast-util-from-html` for the HTML parser used
// in roundtrip tests, `@esm-bundle/chai` for assertions). Coverage is
// scoped to `src/`; thresholds enforce the SDK's quality bar.

import { readdirSync } from 'node:fs';

/**
 * Server command `list-shared-schema-modules`. Returns the path of every
 * version module in `src/types/shared/`, such as
 * `/src/types/shared/image/1.0.0.js`, because tests in the browser can't list
 * a folder.
 */
const listSharedSchemaModules = {
  name: 'list-shared-schema-modules',
  executeCommand({ command }) {
    if (command !== 'list-shared-schema-modules') {
      return undefined;
    }
    return readdirSync('src/types/shared', { recursive: true })
      .map((file) => file.replaceAll('\\', '/'))
      .filter((file) => file.includes('/') && file.endsWith('.js'))
      .map((file) => `/src/types/shared/${file}`);
  },
};

export default {
  files: 'test/**/*.test.js',
  plugins: [listSharedSchemaModules],
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
