# Shared schemas

Shared schemas are JSON Schemas for common shapes, such as an image or a file.
Each version is a JS module in [src/types/shared/](../src/types/shared/), and
its `$id` is its public URL:

```txt
https://headless.adobe.net/schemas/shared/{name}/versions/{major}.{minor}.{patch}
```

`src/types/shared/image/1.0.0.js`, for example, has the `$id`
`https://headless.adobe.net/schemas/shared/image/versions/1.0.0`.

## Delivery

The SDK holds every version and never fetches one.

- da-sc bundles the SDK and serves each URL with `getSharedSchema({ name, version })`
  as JSON. An unknown name or version is a 404. Other JSON Schema tools, such as
  AJV, fetch a shared schema from its URL.
- The SDK resolves a `$ref` to a shared schema from its own modules.

A new version reaches da-sc with the next SDK release that da-sc deploys.

## Versions

A version never changes once an SDK release has it, because schemas reference
it by URL. CI fails when a module from the last release changes or is removed.
A new shape goes into a new version.

- **major** for a change that can reject data the previous version accepted,
  such as a new required property or a removed one
- **minor** for a change that still accepts all data the previous version
  accepted, such as a new optional property
- **patch** for a change that accepts and rejects the same data as before, such
  as a clearer description

### Adding a version

1. Add a module at `src/types/shared/<name>/<major>.<minor>.<patch>.js` that
   imports nothing, with its URL as `$id`.
2. Import it in `src/types/shared/index.js` and add it to the list there. The
   registry in `src/types/index.js` stays unchanged.

## Names

A `<name>` is lowercase letters and digits in words joined by single dashes,
starts with a letter and has at most 64 characters, such as `image` or
`video-clip`. The SDK throws at load on an `$id` that is not a URL as above, and
on an `$id` that repeats.
