# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-10-07

### Added

- **Value Transforms** — rewrite sentinel/placeholder values before sparse filtering and type casting
  - **Rule Keys** — Rule ID, Key Scope (`all` · `prefix` · `list` · `exact`), Key Pattern, Case
  - **Rule Actions** — Rule ID, Match Value, Action (`set_null` · `omit` · `replace`), Replace With
  - Join by Rule ID with **1:n** actions (several match values per key rule)
  - Case on the Keys row applies to all actions of that Rule ID
  - First matching rule wins; group fields use path `groupName.jsonKey`
- Template tests covering transforms (prefix/list/exact, 1:n match values, omit/replace, group paths)
- README section for Value Transforms, including BigQuery Data Dispatcher note on omitted `null` keys

### Changed

- Sparse / Settings help: empty mapped values stay omitted; explicit JSON `null` is kept for type `null_value` and transform **Set null**
- README Features: Value Transforms; clarify sparse vs explicit `null`

## [1.0.0] - 2026-09-15

### Added

- Initial release: sparse typed JSON Object Builder for Server GTM
- Flat fields and one-level grouped objects
- Strict types: `string` · `number` · `boolean` · `null_value` · `raw_json`
- Output modes: `native_object` (default) and `json_string`
- Privacy-safe invalid-value and debug logging
- Importable template with sandboxed JS and template tests

[Unreleased]: https://github.com/mediafaktur/gtm-json-object-builder/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/mediafaktur/gtm-json-object-builder/releases/tag/v1.1.0
[1.0.0]: https://github.com/mediafaktur/gtm-json-object-builder/releases/tag/v1.0.0
