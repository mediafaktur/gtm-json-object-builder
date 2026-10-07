# GTM JSON Object Builder

Server-side Google Tag Manager **variable** template that builds sparse, typed JavaScript objects from flat fields and grouped rows.

Designed for event-level JSON overrides in [BigQuery Data Dispatcher](https://github.com/mediafaktur/gtm-bigquery-data-dispatcher).

```
JSON Object Builder
  → native object | undefined
  → Event-based JSON Override (Dispatcher)
  → Dispatcher validates & serializes
  → BigQuery JSON column
```

## Features

- **Native object by default** (`native_object`) — optional `json_string` compatibility mode
- **Sparse output** — omits `undefined`, `''`, and whitespace-only strings; keeps `0`, `false`, `"0"`, `"false"`, `[]`, `{}`; explicit JSON `null` via type `null_value` or transform **Set null**
- **Strict typing** — `string` · `number` · `boolean` · `null_value` · `raw_json`
- **Value transforms** — optional rules to rewrite sentinels (e.g. `"not set"` → `null` / omit / replace) **before** sparse filtering and type casting
- **Flat + grouped fields** — one-level nested objects; groups are created only when a valid value exists
- **Last valid key wins** — later empty/invalid values do not delete earlier valid ones
- **Grouped overrides flat** — same-named group replaces a flat key
- **Privacy-safe logging** — invalid values log section/key/type/reason only; debug logs metadata, never payloads

## Requirements

- Server GTM container
- Logging permission (included in the template)

## Installation

1. Download [`templates/gtm-json-object-builder.tpl`](./templates/gtm-json-object-builder.tpl)
2. In Server GTM: **Templates → Variable Templates → New → Import**
3. Create a variable of type **JSON Object Builder**

## Configuration

### Flat JSON Fields

| Column | Description |
|--------|-------------|
| Key | Top-level property name |
| Value | Literal or GTM variable |
| Type | `string` · `number` · `boolean` · `null_value` · `raw_json` |

### Grouped JSON Objects

| Column | Description |
|--------|-------------|
| Group Key | Nested object name (e.g. `user`, `device`) |
| JSON Key | Property inside the group |
| JSON Value | Literal or GTM variable |
| Type | Same type IDs as flat fields |

Empty groups are never emitted as `{}`. Explicit empty objects/arrays via `raw_json` (`{}` / `[]`) are kept.

### Value Transforms

Optional. Runs on **raw values before** sparse filtering and type casting. **First matching rule wins.**

GTM simple tables are single-row only, so rules are split into two tables joined by **Rule ID** (1:n — several actions per key rule).

1. **Rule Keys** — Rule ID, Key Scope, Key Pattern, Case  
2. **Rule Actions** — same Rule ID, Match Value, Action, Replace With  

| Key Scope | Key Pattern example |
|-----------|---------------------|
| `all` | — |
| `prefix` | `form_` |
| `list` | `a, b, c` |
| `exact` | `form_value` |

Actions: `set_null` · `omit` · `replace`  
Case: `exact_ci` (trim + ignore case) · `exact` — set on the Keys row; applies to all actions of that Rule ID.  

Group fields use the path `groupName.jsonKey` (e.g. `user.id`).

**Example — form sentinels**

| Rule ID | Key Scope | Key Pattern | Case |
|---------|-----------|-------------|------|
| `forms_null` | prefix | `form_` | Ignore case |

| Rule ID | Match Value | Action | Replace With |
|---------|-------------|--------|--------------|
| `forms_null` | `not set` | Set null | |
| `forms_null` | `(not set)` | Set null | |

→ `form_type: "not set"` and `form_campus: "(not set)"` become `null`; keys without the `form_` prefix stay unchanged.

Downstream note: BigQuery Data Dispatcher typically omits `null` keys from the payload. Use **Omit key** if you only need those fields absent in BQ.

### Settings

| Setting | Default | Notes |
|---------|---------|--------|
| Output mode | `native_object` | Use native objects for Dispatcher overrides; `json_string` only for legacy consumers |
| Sparse output | on | Empty mapped values are always omitted; explicit JSON `null` via `null_value` or transform Set null |
| Sort keys | off | Deterministic key order for tests/stable output; no semantic change |
| Debug logging | off | Logs `{ output_type, top_level_keys, top_level_key_count, group_names }` only |

## Type behavior

| Type ID | Accepted input | Result |
|---------|----------------|--------|
| `string` | Non-empty value | String |
| `number` | Finite number or numeric string | Number (no string fallback) |
| `boolean` | `true`/`false`, `1`/`0`, and their string forms | Boolean (`"yes"`/`"no"` rejected) |
| `null_value` | Any (ignored) | Always JSON `null` |
| `raw_json` | Object/array, or JSON string of object/array | Embedded object/array |

Invalid configured values are skipped. If nothing remains, the variable returns `undefined`.

## Example

**Flat**

| Key | Value | Type |
|-----|-------|------|
| `event_name` | `{{Event Name}}` | string |
| `item_count` | `{{Item Count}}` | number |
| `is_logged_in` | `{{Logged In}}` | boolean |

**Grouped**

| Group Key | JSON Key | JSON Value | Type |
|-----------|----------|------------|------|
| `device` | `os` | `{{OS}}` | string |
| `device` | `browser` | `{{Browser}}` | string |
| `geo` | `country` | `{{Country}}` | string |

**Output (native object)**

```js
{
  event_name: 'purchase',
  item_count: 2,
  is_logged_in: true,
  device: { os: 'iOS', browser: 'Safari' },
  geo: { country: 'DE' }
}
```

## Repository layout

```
code/gtm-json-object-builder.js      # Sandboxed JS (source of truth for editing)
templates/gtm-json-object-builder.tpl # Importable GTM template (includes tests)
```

Keep JS and the `___SANDBOXED_JS_FOR_SERVER___` section of the `.tpl` in sync when changing logic. Run template tests in the GTM Template Editor (**Tests → Run Tests**).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT — see [LICENSE](./LICENSE)

## Author

Florian Pankarter · [/ MEDIAFAKTUR](https://mediafaktur.marketing)  
[fp@mediafaktur.marketing](mailto:fp@mediafaktur.marketing)
