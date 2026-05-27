# Examples

Runnable Node scripts that exercise each major API surface of `da-sc-sdk`. Use them as starting points for your own integrations.

| File | What it shows | API used |
| ---- | ------------- | -------- |
| [`validate-schema.js`](./validate-schema.js) | Check whether a schema is well-formed. No data, no state. | `validateSchema` |
| [`validate.js`](./validate.js) | Validate data against a schema. No state, no save, no DOM. | `validateData` |
| [`quick-start.js`](./quick-start.js) | Stateful editing: create an engine, mutate, observe via `onChange`. | `createEngine` |
| [`roundtrip.js`](./roundtrip.js) | JSON → DA-format HTML → JSON. Lossless wire-format codec. | `convertJsonToHtml`, `convertHtmlToJson` |

## Running

These examples import from the local source via `../src/index.js` so they work straight out of the repository — no `npm install` of the package itself needed:

```bash
node examples/validate-schema.js
node examples/validate.js
node examples/quick-start.js
node examples/roundtrip.js
```

When using `da-sc-sdk` as an installed npm package, replace `'../src/index.js'` with `'da-sc-sdk'`:

```js
// in this repo
import { createEngine } from '../src/index.js';

// in your project, after `npm install da-sc-sdk`
import { createEngine } from 'da-sc-sdk';
```

## What's NOT in here

- **A browser example** — the SDK has no browser-specific behavior; the same code in `validate.js` / `roundtrip.js` / `quick-start.js` runs unchanged in a browser.
- **A specific HTTP transport** — the SDK has no built-in save concept. These examples log instead; real consumers wire their own transport inside `onChange`.
- **TypeScript** — examples are plain JS to match the SDK's authoring style. They work fine in TS projects.

For the full schema dialect the SDK accepts, see [docs/schema-spec.md](../docs/schema-spec.md). For the architecture, see [docs/architecture.md](../docs/architecture.md).
