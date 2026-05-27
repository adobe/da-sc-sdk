import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import { recommended, source, test } from '@adobe/eslint-config-helix';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig([
  globalIgnores([
    'eslint.config.js',
    'build.mjs',
    'web-test-runner.config.mjs',
    'dist',
    'node_modules',
  ]),
  {
    languageOptions: {
      ...recommended.languageOptions,
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.mocha,
        ...globals.serviceworker,
        ...globals.es6,
      },
    },
    rules: {
      'class-methods-use-this': 0,

      // headers not required to keep file size down
      'header/header': 0,

      'import/no-cycle': 'off',

      'import/no-unresolved': ['error', {
        ignore: ['^https?://'],
      }],

      'import/prefer-default-export': 0,

      'indent': ['error', 2, {
        ignoredNodes: ['TemplateLiteral *'],
        SwitchCase: 1,
      }],

      'max-statements-per-line': ['error', { max: 2 }],

      'no-await-in-loop': 0,

      'no-param-reassign': [2, { props: false }],

      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_$|^e$',
        caughtErrorsIgnorePattern: '^_$|^e$',
        varsIgnorePattern: '^_$|^e$',
      }],

      'object-curly-newline': ['error', {
        multiline: true,
        minProperties: 6,
        consistent: true,
      }],
    },
    plugins: {
      import: recommended.plugins.import,
    },
    extends: [recommended],
  },
  source,
  test,

  // editor/ boundary — must stay headless. No DOM, no HTML codec, no I/O.
  // The whole point of this layer is that it runs in any ESM runtime; pulling
  // in anything from html/ or external transports breaks that invariant.
  // See docs/architecture.md §2.
  {
    files: ['src/editor/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['../html/*', '../html/**', '../../html/*', '../../html/**'],
            message: 'editor/ must not import from html/ — keep the engine headless. See docs/architecture.md §2.',
          },
        ],
      }],
    },
  },

  // Symmetric boundary the other way — html/ shouldn't reach into the editor.
  {
    files: ['src/html/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['../editor/*', '../editor/**', '../../editor/*', '../../editor/**'],
            message: 'html/ must not import from editor/ — the HTML codec is a pure utility layer. See docs/architecture.md §2.',
          },
        ],
      }],
    },
  },

  // Allow console + relaxed rules in tests.
  {
    files: ['test/**/*.js'],
    rules: {
      'max-classes-per-file': 0,
      'no-console': 'off',
      'no-underscore-dangle': 0,
      'no-unused-expressions': 0,
    },
  },

  // Allow console in examples — they're documentation, demonstrating output.
  {
    files: ['examples/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
]);
