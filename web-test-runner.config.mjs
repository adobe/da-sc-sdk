// Web Test Runner configuration for da-sc-sdk.
//
// The SDK is a self-contained package — this config is everything its
// tests need. `nodeResolve` lets wtr resolve bare specifiers from the
// SDK's own node_modules (`hast-util-from-html` for the HTML parser used
// in roundtrip tests, `@esm-bundle/chai` for assertions). Coverage is
// scoped to `src/`; thresholds enforce the SDK's quality bar.

export default {
  files: 'test/**/*.test.js',
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
