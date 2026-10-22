# Type definitions

The JSON files in this folder define the types a schema can reference by URL.
They are the published definitions. The SDK reads an identical JS module per
file from `src/types/`, because not every runtime can import JSON. A test keeps
both identical. The SDK derives each type's name and URL from its `$id`.

Each file is named by its semantic version, `v<major>.<minor>.<patch>.json`. A
published version never changes. A new shape goes into a new file:

- **major** for a potential breaking change, such as removing or renaming a property
- **minor** for a compatible addition, such as a new optional property
- **patch** for a change that keeps the shape, such as a clearer description

To add a version, add its JSON file here and an identical JS module under
`src/types/<name>/`, then list the module in `DEFINITIONS` in
`src/types/index.js`. A test fails until all three are in place.
`TYPE_URLS.<name>` always points to the latest version.

## Experimental

The `$id` URLs point to this folder on GitHub until the types are served from a
production domain. After that move, the SDK keeps accepting the GitHub URLs.
Schemas reference these files by URL, so a file here is never moved or renamed
on `main`.
