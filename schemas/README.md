# Shared schemas

The files in `shared/` are the shared schemas, JSON Schemas for common shapes
such as an image. Each one is published at

```txt
https://headless.adobe.net/schemas/shared/{name}/v{major}.{minor}.{patch}.json
```

and that URL is its `$id`. A file's path in this repository is its public path,
so `shared/image/v1.0.0.json` is published at
`https://headless.adobe.net/schemas/shared/image/v1.0.0.json`. This folder is
not part of the npm package. The SDK holds an identical JS module per file.

## Versions

Each file is named by its semantic version, `v<major>.<minor>.<patch>.json`. A
published version never changes, because schemas reference it by URL. A new
shape goes into a new version.

- **major** for a change that can reject data the previous version accepted,
  such as a new required property or a removed one
- **minor** for a change that still accepts all data the previous version
  accepted, such as a new optional property
- **patch** for a change that accepts and rejects the same data as before, such
  as a clearer description

### Adding a version

1. Add the JSON file at `shared/<name>/v<major>.<minor>.<patch>.json`.
2. Add an identical JS module at
   `src/types/shared/<name>/v<major>.<minor>.<patch>.js` that imports nothing.
3. Import the module in `src/types/shared/index.js` and add it to the list
   there. The registry in `src/types/index.js` stays unchanged.

`npm test` fails until every JSON file is registered and identical to its
module.

## Names

A `<name>` is lowercase letters and digits in words joined by single dashes,
starts with a letter and has at most 64 characters, such as `image` or
`video-clip`. The SDK throws at load on an `$id` that is not a URL as above, and
on an `$id` that repeats.
