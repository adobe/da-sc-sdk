# JSON Schema support

Reference specification for JSON Schemas consumed by this SDK. Defines the complete set of allowed keywords and forms.

- **Dialect:** JSON Schema 2020-12 (subset — see rules and supported keywords below)
- **Audience:** schema authors and code-generation agents

> A conformant schema uses only the constructs documented here. Other keywords are ignored; an
> unsupported `$ref` or a keyword that would change an asset is a schema issue (see §6).

---

## 1. Authoring rules

A conformant schema satisfies every rule below.

| # | Rule |
| - | ---- |
| R1 | Every node must declare `type` explicitly. Inference from `properties`, `items`, or `enum` is not relied upon. |
| R2 | `type` must be exactly one of: `"string"`, `"number"`, `"integer"`, `"boolean"`, `"object"`, `"array"`. |
| R3 | `type` must not be an array (no `["string", "null"]`). |
| R4 | Every node must define `title`. On an asset field, set it next to the `$ref`. |
| R5 | Every `object` node defines its fields via `properties`. |
| R6 | Every `array` node defines its element schema via `items` (a single schema object, not an array). |
| R7 | Repeated shapes are factored into `$defs` and referenced via `$ref`. |
| R8 | `$ref` values must be same-document JSON Pointers (`#/...`) that resolve, or exactly one of the two asset definition URLs (see [Assets](#assets)). Any other `$ref` is a schema issue. |
| R9 | Property keys must begin with a letter (`a–z`, `A–Z`) and contain only letters, digits (`0–9`), and hyphens (`-`). |
| R10 | The property keys `metadata` and `section-metadata` are reserved. They must not appear in `properties`. |
| R11 | The root schema may declare `type: "object"` or `type: "array"`. |

---

## 2. Supported types

### `string`

```json
{ "type": "string", "title": "Name" }
```

When `enum` is present, the field renders as a select dropdown (see §4).

### `number`

```json
{ "type": "number", "title": "Score" }
```

Accepts any finite number.

### `integer`

```json
{ "type": "integer", "title": "Age" }
```

Rejects fractional values.

### `boolean`

```json
{ "type": "boolean", "title": "Subscribed" }
```

Defaults to `false` when not specified by `default`.

### `object`

```json
{
  "type": "object",
  "title": "Contact",
  "required": ["name"],
  "properties": {
    "name":  { "type": "string", "title": "Name" },
    "email": { "type": "string", "title": "Email" }
  }
}
```

Fields are declared in `properties`. `required` is an array of property names.

#### Property key rules

Property keys must begin with a letter (`a–z`, `A–Z`) and contain only letters, digits (`0–9`), and hyphens (`-`).

```
valid:   name  firstName  first-name  My-Field  field1  h1
invalid: _name  my.field  123abc
```

The keys `metadata` and `section-metadata` are reserved and must not appear in `properties`.

### `array`

The element schema is a single object under `items`. It may be any supported type — a primitive, an object, or another array.

Array of primitives (`string`, `number`, `integer`, `boolean`):

```json
{
  "type": "array",
  "title": "Tags",
  "items": { "type": "string", "title": "Tag" }
}
```

Array of objects:

```json
{
  "type": "array",
  "title": "Contacts",
  "items": {
    "type": "object",
    "title": "Contact",
    "required": ["name"],
    "properties": {
      "name":  { "type": "string", "title": "Name" },
      "email": { "type": "string", "title": "Email" }
    }
  }
}
```

Array of arrays (the inner array must declare its own `items`):

```json
{
  "type": "array",
  "title": "Matrix",
  "items": {
    "type": "array",
    "title": "Row",
    "items": { "type": "number", "title": "Cell" }
  }
}
```

### Image and file assets

An asset field holds a reference to an image, or to a file such as a PDF. It is declared with a
`$ref` to an asset definition instead of a `type`, and its value is an object:

```json
{ "$ref": "https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/image/v1.json", "title": "Hero image" }
```

See [Assets](#assets) for the definitions, the value shape, and the keywords allowed next to the
`$ref`.

### Nesting

Any supported type, including an asset, may appear inside `properties` or `items`. Objects can contain objects and arrays; arrays can contain objects, primitives, or other arrays. Nesting depth is not limited by the schema rules — keep nesting shallow for readability (see §8).

```json
{
  "type": "object",
  "title": "Order",
  "properties": {
    "customer": {
      "type": "object",
      "title": "Customer",
      "properties": {
        "address": {
          "type": "object",
          "title": "Address",
          "properties": {
            "city":    { "type": "string", "title": "City" },
            "country": { "type": "string", "title": "Country" }
          }
        }
      }
    },
    "lineItems": {
      "type": "array",
      "title": "Line items",
      "items": {
        "type": "object",
        "title": "Line item",
        "properties": {
          "sku":      { "type": "string",  "title": "SKU" },
          "quantity": { "type": "integer", "title": "Quantity", "minimum": 1 }
        }
      }
    }
  }
}
```

---

## 3. Supported annotations

These keywords describe presentation. They do not constrain the value.

| Keyword     | Type      | Applies to | Effect |
| ----------- | --------- | ---------- | ------ |
| `title`     | string    | any        | Label shown above the input. **Required on every node** (rule R4). |
| `description` | string  | any        | Help text shown with the field (above the input). Does not constrain the value. |
| `default`   | matches type | any     | Pre-fills the field when the document has no value. |
| `readOnly`  | boolean   | any        | Disables the input. The value remains visible. |
| `required`  | string[]  | object     | Names properties that must hold a non-empty value. The message depends on the control: `"This field is required."` (field), `"This section is required."` (object), or the item count (array). |

`required` is declared on the parent `object`, not on the child property.

```json
{
  "type": "object",
  "title": "Article",
  "required": ["title"],
  "properties": {
    "title": { "type": "string", "title": "Title" }
  }
}
```

### Vendor annotations

Vendor extensions are keywords outside standard JSON Schema, prefixed `x-`. They carry presentation
intent and do not constrain the value. Only the keywords and values defined below are recognized;
anything else is ignored.

| Keyword | Type | Applies to | Effect |
| ------- | ---- | ---------- | ------ |
| `x-semantic-type` | string | `string` | Declares the semantic kind of a value. Defined value: `long-text` (multi-line text). |

#### `x-semantic-type`

`long-text` declares that the string holds long-form, multi-line text rather than a short
single-line value.

```json
{ "type": "string", "title": "Summary", "maxLength": 2000, "x-semantic-type": "long-text" }
```

- `long-text` is valid only on `string`; on any other type it is ignored.
- On a `string`, if `enum` or a supported `format` is also present, that keyword applies and `x-semantic-type` has no effect (it is vendor glue; the standard keyword wins).
- `long-text` is the defined value; any other value is ignored.
- Does not affect validation — `minLength`, `maxLength`, and `pattern` apply independently.

---

## 4. Supported constraints

These keywords restrict the value. Validation reports an error when violated.

| Keyword              | Type   | Applies to       |
| -------------------- | ------ | ---------------- |
| `enum`               | array  | string           |
| `minLength`          | int    | string           |
| `maxLength`          | int    | string           |
| `pattern`            | string | string (ECMA regex) |
| `format`             | string | string (`date` / `time` / `date-time`) |
| `minimum`            | number | number, integer  |
| `maximum`            | number | number, integer  |
| `minItems`           | int    | array            |
| `maxItems`           | int    | array            |

On a single `string` node, do not combine `enum`, `format`, and `x-semantic-type` — they are mutually exclusive. If more than one is present, precedence is `enum` > `format` > `x-semantic-type`, and the losers are ignored.

`enum` example:

```json
{
  "type": "string",
  "title": "Status",
  "enum": ["Planning", "Active", "Completed", "On Hold"]
}
```

`minimum` and `maximum` are inclusive bounds. For numeric range constraints, only these are supported.

`pattern` is a regular expression following the ECMA 262 grammar. Use it for shape constraints (slugs, identifiers); use `enum` for closed value sets.

```json
{
  "type": "string",
  "title": "Slug",
  "minLength": 3,
  "maxLength": 30,
  "pattern": "^[a-z0-9-]+$"
}
```

### Date and time (`format`)

`format` on a `string` declares the value as a date, time, or timestamp. When it
is present the field renders as the matching `date` / `time` / `date-time`
control, and the stored value is constrained to a single canonical shape.

| `format`    | Kind                                | Stored value              | Example                  |
| ----------- | ----------------------------------- | ------------------------- | ------------------------ |
| `date`      | Floating calendar date              | `YYYY-MM-DD`              | `2026-08-14`             |
| `time`      | Floating wall-clock time (24-hour)  | `HH:MM` or `HH:MM:SS`     | `09:30`                  |
| `date-time` | Absolute instant, in UTC            | `YYYY-MM-DDTHH:MM:00Z`    | `2026-08-14T13:00:00Z`   |

- Valid only on `string`. On any other type it is ignored.
- If `enum` is also present, `enum` applies and `format` has no effect.
- If `x-semantic-type` is also present, `format` wins — a supported `format` beats the vendor `x-semantic-type` hint.
- **`date` and `time` are floating** — they carry no time zone and mean the same
  everywhere (a publish date, store opening hours).
- **`date-time` is an absolute instant, stored in UTC** (trailing `Z`) at minute
  precision with zero seconds — exactly `YYYY-MM-DDTHH:MM:00Z`. A single
  canonical form guarantees that any two writers produce identical, comparable
  values.

The value is validated for both shape and real calendar/clock validity:

| `format`    | Accepts                     | Rejects                                            | Message                        |
| ----------- | --------------------------- | -------------------------------------------------- | ------------------------------ |
| `date`      | a real `YYYY-MM-DD` date    | `2026-02-30`, `08/14/2026`                         | `Must be a valid date.`        |
| `time`      | a real 24-hour time         | `24:00`, `9:5`, `23:59:60` (no leap seconds)      | `Must be a valid time.`        |
| `date-time` | UTC `…:00Z`, zero seconds   | an offset (`+02:00`), non-zero seconds, missing `Z` | `Must be a valid date and time.` |

> `date-time` is deliberately **stricter than RFC 3339**: only UTC `Z` with zero
> seconds is accepted, so every writer produces one identical value.

```json
{ "type": "string", "title": "Publish date", "format": "date" }
{ "type": "string", "title": "Opening time",  "format": "time" }
{ "type": "string", "title": "Event start",   "format": "date-time" }
```

An empty value is absent (§7): an optional date/time field may be left blank, and
`format` is not enforced on an absent value.

---

## 5. Supported structural keywords

| Keyword       | Type   | Notes |
| ------------- | ------ | ----- |
| `type`        | string | Rules R1–R3. |
| `properties`  | object | Required on every `object`. |
| `items`       | object | Required on every `array`. A single schema, not an array. |
| `$ref`        | string | Same-document (`#/...`), or an asset definition URL (see [Assets](#assets)). |
| `$defs`       | object | Container for reusable schemas referenced via `$ref`. |

`$ref` and `$defs`:

```json
{
  "$defs": {
    "Contact": {
      "type": "object",
      "title": "Contact",
      "required": ["name"],
      "properties": {
        "name":  { "type": "string", "title": "Name" },
        "email": { "type": "string", "title": "Email" }
      }
    }
  },
  "type": "object",
  "title": "Project",
  "properties": {
    "owner":  { "$ref": "#/$defs/Contact" },
    "editor": { "$ref": "#/$defs/Contact" }
  }
}
```

### Assets

An asset field holds one reference to an image, or to a file such as a PDF. Declare it with a `$ref`
to one of the two asset definitions:

| Asset | `$ref` |
| ----- | ------ |
| image | `https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/image/v1.json` |
| file  | `https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/file/v1.json` |

```json
{
  "type": "object",
  "title": "Product",
  "properties": {
    "heroImage": { "$ref": "https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/image/v1.json", "title": "Hero image", "required": ["altText"] },
    "datasheet": { "$ref": "https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/file/v1.json", "title": "Datasheet" }
  }
}
```

Use the URLs exactly as shown. Any other URL, including another version or branch, is a schema issue
(`external-ref`). The definitions are JSON Schema 2020-12 documents published at these URLs. A
published definition never changes; a new shape gets a new URL (`v2`).

#### Value

An asset value is an object with these properties:

| Asset | Property | Type | Meaning |
| ----- | -------- | ---- | ------- |
| image | `src` | string | Where the image is, for example an absolute URL or a media path. Required when the asset has a value. |
| image | `altText` | string | Text that describes the image, used as its `alt`. Optional unless the field requires it. |
| file  | `src` | string | Where the file is. Required when the asset has a value. |

No other properties are allowed. The SDK does not check the form of `src`.

```json
{
  "heroImage": { "src": "https://example.com/hero.jpg", "altText": "A runner at dawn" },
  "datasheet": { "src": "https://example.com/specs.pdf" }
}
```

#### Keywords next to the `$ref`

The asset's shape belongs to its definition. Next to the `$ref`, only these keywords are allowed:

| Keyword | Image | File | Effect |
| ------- | ----- | ---- | ------ |
| `title` | yes | yes | Label of the field. Required (R4); the definition's own title is not used. |
| `description` | yes | yes | Help text, as on any field (§3). |
| `readOnly` | yes | yes | The asset cannot be changed. |
| `default` | yes | yes | An asset value, for example `{ "src": "./media_1a2b.jpg", "altText": "Logo" }`. |
| `required` | `["altText"]` only | no | Makes the alt text mandatory whenever the image has a value. |

Any other keyword that could change the value, such as `type`, `properties`,
`additionalProperties`, `enum`, or another `required` (`[]`, `["src"]`, or any `required` on a
file), is a schema issue (`asset-ref-keywords`). This also applies next to a local `$ref` that
resolves to an asset. `$comment`, `examples`, `deprecated`, `writeOnly`, and `x-*` keywords are
ignored.

#### Required and empty assets

- To require an asset, list its key in the parent object's `required`.
- An asset whose properties are all empty (`{}`, `{ "src": "" }`) has no value; see §7.
- An asset with any value must have a `src`, and an `altText` when the field sets
  `required: ["altText"]`.

#### Patterns

Reuse an asset declaration through `$defs`:

```json
{
  "$defs": {
    "Logo": { "$ref": "https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/image/v1.json", "title": "Logo", "required": ["altText"] }
  },
  "type": "object",
  "title": "Partners",
  "properties": {
    "primaryLogo":   { "$ref": "#/$defs/Logo" },
    "secondaryLogo": { "$ref": "#/$defs/Logo" }
  }
}
```

List several assets with an `array` whose `items` is an asset:

```json
{
  "type": "array",
  "title": "Gallery",
  "items": { "$ref": "https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/image/v1.json", "title": "Image" }
}
```

Add fields such as a caption by wrapping the asset in an object:

```json
{
  "type": "object",
  "title": "Figure",
  "properties": {
    "image":   { "$ref": "https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/image/v1.json", "title": "Image" },
    "caption": { "type": "string", "title": "Caption" }
  }
}
```

#### Other JSON Schema validators

A validator other than the SDK must resolve the asset URLs like any remote `$ref`. Most validators do
not fetch references, so embed the definitions with the SDK's `bundleSchema` before validating (see
the [README](../README.md#validate-with-other-json-schema-validators)).

---

## 6. Scope

Any keyword, type, or construct not listed in §2–5 is ignored by the SDK, with these exceptions,
which are schema issues: a `$ref` that is neither a resolvable `#/...` pointer nor an asset
definition URL (`external-ref`, `unresolved-ref`), and a keyword next to an asset `$ref` that is not
allowed there (`asset-ref-keywords`). A schema with issues has no valid documents until they are
fixed.

---

## 7. Empty value semantics

The SDK treats unfilled values as absent.

- An empty string (`""`), a whitespace-only string, an empty array (`[]` or one whose items are all empty), and an empty object (`{}` or one whose fields are all empty) are considered absent.
- Constraints (`enum`, `pattern`, `minLength`, etc.) are not enforced on absent optional fields.
- A `required` value that is absent is flagged. The message matches the control: `"This field is required."` for a field or an asset, `"This section is required."` for an object, and the item count for an array.
- Absent values are stripped from the saved document.

For the schema

```json
{
  "type": "object",
  "title": "Item",
  "properties": {
    "status": {
      "type": "string",
      "title": "Status",
      "enum": ["Active", "Done"]
    }
  }
}
```

| Document          | Outcome                                |
| ----------------- | -------------------------------------- |
| `{}`              | Valid. `status` is absent.             |
| `{ "status": "" }` | Valid. `status` is treated as absent. |
| `{ "status": "Other" }` | Invalid. `enum` is enforced.     |
| `{ "status": "Active" }` | Valid.                          |

---

## 8. Best practices

Conventions that produce a usable document and a maintainable schema.

- **Set `title` on every node, including `$defs` entries and `items`.** Without it consumers fall back to the property name, which is rarely the right label.
- **Use `enum` for closed value sets**, not `pattern`. A select dropdown communicates intent and prevents typos.
- **Factor repeated shapes into `$defs`.** If the same object appears in two places, define it once and `$ref` to it.
- **Use `default` to seed the most likely value.** It pre-fills the input and is preserved through the absent-stripping rule because the user does not have to do anything for it to be valid.
- **Use `readOnly` for fields the user must not modify.** Useful for IDs and audit fields whose value comes from the server.
- **Reserve `required` for fields whose absence makes the document meaningless.** Do not mark a field required just to force a default — set `default` instead.
- **Pick the asset definition by content.** Use the image definition for pictures shown on the page, and the file definition for documents people open or download, such as PDFs.
- **Require alt text on images that carry meaning.** Set `required: ["altText"]` next to the image `$ref`, so every image gets a description for screen readers.
- **Keep the schema flat.** A flat list of fields is easier to scan than a tree of nested objects.

---

## 9. Complete example

A schema exercising every supported keyword, including reusable shapes that reference each other, inline nested structures, and image and file assets:

```json
{
  "$defs": {
    "Address": {
      "type": "object",
      "title": "Address",
      "required": ["country"],
      "properties": {
        "street":  { "type": "string", "title": "Street" },
        "city":    { "type": "string", "title": "City" },
        "country": { "type": "string", "title": "Country" }
      }
    },
    "Contact": {
      "type": "object",
      "title": "Contact",
      "required": ["name"],
      "properties": {
        "name":    { "type": "string", "title": "Name" },
        "email":   { "type": "string", "title": "Email" },
        "address": { "$ref": "#/$defs/Address" }
      }
    },
    "Milestone": {
      "type": "object",
      "title": "Milestone",
      "required": ["name"],
      "properties": {
        "name":      { "type": "string", "title": "Name", "minLength": 1, "maxLength": 80 },
        "completed": { "type": "boolean", "title": "Completed", "default": false },
        "owner":     { "$ref": "#/$defs/Contact" }
      }
    }
  },
  "type": "object",
  "title": "Project",
  "required": ["title", "slug", "status"],
  "properties": {
    "title": {
      "type": "string",
      "title": "Title",
      "default": "Untitled project"
    },
    "slug": {
      "type": "string",
      "title": "Slug",
      "minLength": 3,
      "maxLength": 30,
      "pattern": "^[a-z0-9-]+$"
    },
    "summary": {
      "type": "string",
      "title": "Summary",
      "description": "A short abstract shown in listings.",
      "maxLength": 280,
      "x-semantic-type": "long-text"
    },
    "status": {
      "type": "string",
      "title": "Status",
      "enum": ["Planning", "Active", "Completed", "On Hold"],
      "default": "Planning"
    },
    "priority": {
      "type": "integer",
      "title": "Priority",
      "minimum": 1,
      "maximum": 5,
      "default": 3
    },
    "score": {
      "type": "number",
      "title": "Score",
      "minimum": 0,
      "maximum": 100
    },
    "publishDate": {
      "type": "string",
      "title": "Publish date",
      "format": "date"
    },
    "publishedAt": {
      "type": "string",
      "title": "Published at",
      "format": "date-time"
    },
    "dailyStandup": {
      "type": "string",
      "title": "Daily standup",
      "format": "time"
    },
    "archived": {
      "type": "boolean",
      "title": "Archived",
      "default": false
    },
    "ownerId": {
      "type": "string",
      "title": "Owner ID",
      "readOnly": true
    },
    "tags": {
      "type": "array",
      "title": "Tags",
      "minItems": 1,
      "maxItems": 10,
      "items": { "type": "string", "title": "Tag" }
    },
    "owner": {
      "$ref": "#/$defs/Contact"
    },
    "collaborators": {
      "type": "array",
      "title": "Collaborators",
      "items": { "$ref": "#/$defs/Contact" }
    },
    "milestones": {
      "type": "array",
      "title": "Milestones",
      "items": { "$ref": "#/$defs/Milestone" }
    },
    "coverImage": {
      "$ref": "https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/image/v1.json",
      "title": "Cover image",
      "description": "Shown at the top of the project page.",
      "required": ["altText"]
    },
    "brief": {
      "$ref": "https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/file/v1.json",
      "title": "Project brief"
    },
    "gallery": {
      "type": "array",
      "title": "Gallery",
      "maxItems": 12,
      "items": {
        "$ref": "https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/image/v1.json",
        "title": "Image"
      }
    },
    "links": {
      "type": "array",
      "title": "Links",
      "items": {
        "type": "object",
        "title": "Link",
        "required": ["url"],
        "properties": {
          "label": { "type": "string", "title": "Label" },
          "url":   { "type": "string", "title": "URL", "pattern": "^https?://" }
        }
      }
    }
  }
}
```
