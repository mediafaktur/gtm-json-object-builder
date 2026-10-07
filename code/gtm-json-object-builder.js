/**
 * / MEDIAFAKTUR · ANALYTICS UTILITIES
 * JSON Object Builder · GTM Variable Template
 *
 * Builds sparse, typed JavaScript objects from flat fields and grouped rows.
 * Designed for event-level JSON overrides in BigQuery Data Dispatcher.
 *
 * Returns a native object by default, or `undefined` when empty.
 * Optional compatibility mode returns a JSON string.
 *
 * Created and maintained by Florian Pankarter
 * https://mediafaktur.marketing
 * https://github.com/mediafaktur/gtm-json-object-builder
 *
 * Copyright (c) 2026 Florian Pankarter
 * SPDX-License-Identifier: MIT
 */

const JSON = require('JSON');
const logToConsole = require('logToConsole');
const getType = require('getType');


// ========================
// HELPER FUNCTIONS
// ========================

/**
 * Empty mapped values (sparse output).
 * Empty: undefined, null, '', whitespace-only strings.
 * Not empty: 0, false, "0", "false", [], {}
 */
function isEmptyMappedValue(value) {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  if (getType(value) === 'string') {
    return value.trim() === '';
  }
  return false;
}

/**
 * Privacy-safe invalid-value log. Never logs raw values or payloads.
 */
function logInvalidMappedValue(section, key, typeId, reason) {
  logToConsole(
    'JSON Object Builder: invalid mapped value;' +
      ' section=' + section + ';' +
      ' key=' + key + ';' +
      ' type=' + typeId + ';' +
      ' reason=' + reason
  );
}

/**
 * Compile transform rules.
 * Keys + Actions joined by Rule ID (1:n — multiple actions per key rule).
 * Case (match mode) lives on the Keys row; applies to all actions of that ID.
 * Order: Keys table order, then Actions table order. First match wins.
 */
function compileTransformRules(keyRows, actionRows) {
  var compiled = [];
  if (!keyRows || !keyRows.length) {
    return compiled;
  }

  var actionsById = {};
  if (actionRows && actionRows.length) {
    for (var a = 0; a < actionRows.length; a++) {
      var actionRow = actionRows[a];
      if (!actionRow || !actionRow.transformRuleId) {
        continue;
      }
      var actionRuleId = ('' + actionRow.transformRuleId).trim();
      if (!actionRuleId) {
        continue;
      }
      if (!actionsById[actionRuleId]) {
        actionsById[actionRuleId] = [];
      }
      actionsById[actionRuleId].push(actionRow);
    }
  }

  for (var r = 0; r < keyRows.length; r++) {
    var keyRow = keyRows[r];
    if (!keyRow || !keyRow.transformRuleId) {
      continue;
    }

    var ruleId = ('' + keyRow.transformRuleId).trim();
    if (!ruleId) {
      continue;
    }

    var matchedActions = actionsById[ruleId];
    if (!matchedActions || !matchedActions.length) {
      continue;
    }

    var keyScope = keyRow.transformKeyScope || 'all';
    var keyPattern = keyRow.transformKeyPattern
      ? ('' + keyRow.transformKeyPattern).trim()
      : '';
    var matchMode = keyRow.transformMatchMode || 'exact_ci';

    for (var i = 0; i < matchedActions.length; i++) {
      var matchedAction = matchedActions[i];
      var action = matchedAction.transformAction || '';
      var matchValue = matchedAction.transformMatchValue;

      if (!action) {
        continue;
      }
      if (matchValue === undefined || matchValue === null) {
        continue;
      }

      compiled.push({
        ruleId: ruleId,
        keyScope: keyScope,
        keyPattern: keyPattern,
        matchValue: matchValue,
        matchMode: matchMode,
        action: action,
        replaceWith: matchedAction.transformReplaceWith
      });
    }
  }

  return compiled;
}

function keyMatchesScope(key, scope, pattern) {
  if (!key) {
    return false;
  }

  if (scope === 'all' || !scope) {
    return true;
  }

  if (scope === 'exact') {
    return pattern !== '' && key === pattern;
  }

  if (scope === 'prefix') {
    if (!pattern) {
      return false;
    }
    return key.indexOf(pattern) === 0;
  }

  if (scope === 'list') {
    if (!pattern) {
      return false;
    }
    var parts = pattern.split(',');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (part && key === part) {
        return true;
      }
    }
    return false;
  }

  return false;
}

function valueMatchesRule(rawValue, matchValue, matchMode) {
  // Only string-like sentinel matching for V1 (e.g. "not set").
  // Non-string raw values are coerced to string for comparison.
  if (rawValue === undefined || rawValue === null) {
    return false;
  }

  var rawStr = '' + rawValue;
  var matchStr = '' + matchValue;

  if (matchMode === 'exact') {
    return rawStr === matchStr;
  }

  // Default: exact_ci — trim + case-insensitive
  return rawStr.trim().toLowerCase() === matchStr.trim().toLowerCase();
}

/**
 * Apply first matching transform rule.
 * Returns:
 *   { kind: 'passthrough', value }
 *   { kind: 'omit' }
 *   { kind: 'set_null' }
 *   { kind: 'replace', value }
 */
function applyTransforms(rawValue, key, transformRules) {
  if (!transformRules || !transformRules.length) {
    return { kind: 'passthrough', value: rawValue };
  }

  for (var i = 0; i < transformRules.length; i++) {
    var rule = transformRules[i];
    if (!keyMatchesScope(key, rule.keyScope, rule.keyPattern)) {
      continue;
    }
    if (!valueMatchesRule(rawValue, rule.matchValue, rule.matchMode)) {
      continue;
    }

    if (rule.action === 'omit') {
      return { kind: 'omit' };
    }
    if (rule.action === 'set_null') {
      return { kind: 'set_null' };
    }
    if (rule.action === 'replace') {
      return { kind: 'replace', value: rule.replaceWith };
    }
  }

  return { kind: 'passthrough', value: rawValue };
}

/**
 * Strict type conversion.
 * Returns { ok: true, value: ... } or { ok: false, reason: '...' }.
 *
 * Type IDs: string | number | boolean | null_value | raw_json
 */
function convertMappedValue(rawValue, typeId) {
  var t = typeId || 'string';

  if (t === 'null_value') {
    return { ok: true, value: null };
  }

  if (t === 'string') {
    if (isEmptyMappedValue(rawValue)) {
      return { ok: false, reason: 'empty_string' };
    }
    return { ok: true, value: '' + rawValue };
  }

  if (t === 'number') {
    var numType = getType(rawValue);
    var num;

    if (numType === 'number') {
      num = rawValue;
    } else if (numType === 'string') {
      if (isEmptyMappedValue(rawValue)) {
        return { ok: false, reason: 'invalid_number' };
      }
      num = rawValue * 1;
    } else {
      return { ok: false, reason: 'invalid_number' };
    }

    // Reject NaN and positive or negative infinity.
    if (num !== num || num * 0 !== 0) {
      return { ok: false, reason: 'invalid_number' };
    }
    return { ok: true, value: num };
  }

  if (t === 'boolean') {
    var boolType = getType(rawValue);

    if (boolType === 'boolean') {
      return { ok: true, value: rawValue };
    }

    if (boolType === 'number') {
      if (rawValue === 1) {
        return { ok: true, value: true };
      }
      if (rawValue === 0) {
        return { ok: true, value: false };
      }
      return { ok: false, reason: 'invalid_boolean' };
    }

    if (boolType === 'string') {
      var lower = rawValue.toLowerCase();
      if (lower === 'true' || lower === '1') {
        return { ok: true, value: true };
      }
      if (lower === 'false' || lower === '0') {
        return { ok: true, value: false };
      }
      return { ok: false, reason: 'invalid_boolean' };
    }

    return { ok: false, reason: 'invalid_boolean' };
  }

  if (t === 'raw_json') {
    var rawType = getType(rawValue);

    if (rawType === 'object' || rawType === 'array') {
      return { ok: true, value: rawValue };
    }

    if (rawType !== 'string') {
      return { ok: false, reason: 'invalid_raw_json' };
    }

    if (isEmptyMappedValue(rawValue)) {
      return { ok: false, reason: 'invalid_raw_json' };
    }

    // sGTM JSON.parse returns undefined for invalid JSON (no thrown error).
    var parsed = JSON.parse(rawValue);
    if (parsed === undefined) {
      return { ok: false, reason: 'invalid_raw_json' };
    }

    var parsedType = getType(parsed);
    if (parsedType !== 'object' && parsedType !== 'array') {
      return { ok: false, reason: 'invalid_raw_json' };
    }

    return { ok: true, value: parsed };
  }

  return { ok: false, reason: 'unsupported_type' };
}

/**
 * Try to map one configured value. Returns undefined when skipped.
 * Pipeline: transforms → null_value type → sparse → type cast.
 */
function mapConfiguredValue(rawValue, typeId, section, key, transformRules) {
  var t = typeId || 'string';

  // 1) Value transforms (before sparse / type cast)
  var transformed = applyTransforms(rawValue, key, transformRules);
  if (transformed.kind === 'omit') {
    return undefined;
  }
  if (transformed.kind === 'set_null') {
    return null;
  }

  var value = transformed.value;

  // 2) Explicit null type — independent of input emptiness
  if (t === 'null_value') {
    return null;
  }

  // 3) Sparse: omit empty mapped values
  if (isEmptyMappedValue(value)) {
    return undefined;
  }

  // 4) Strict type conversion
  var converted = convertMappedValue(value, t);
  if (!converted.ok) {
    logInvalidMappedValue(section, key, t, converted.reason);
    return undefined;
  }

  return converted.value;
}

function objectHasOwnKeys(obj) {
  if (!obj) {
    return false;
  }
  // Local {} objects only — for...in is sufficient in sGTM sandbox.
  for (var k in obj) {
    return true;
  }
  return false;
}

function listOwnKeys(obj) {
  var keys = [];
  if (!obj) {
    return keys;
  }
  for (var k in obj) {
    keys.push(k);
  }
  return keys;
}

function sortObjectKeys(obj) {
  var sorted = {};
  var keys = listOwnKeys(obj);
  keys.sort();
  for (var i = 0; i < keys.length; i++) {
    var name = keys[i];
    sorted[name] = obj[name];
  }
  return sorted;
}

/**
 * Build a sparse JSON-compatible object from flat + grouped rows.
 *
 * Groups are created only when the first valid value arrives.
 * Fully empty groups never appear as {}.
 * Native empty {} / [] that were explicitly mapped (e.g. raw_json) are kept.
 *
 * Duplicate keys: last valid value wins.
 * Later empty/invalid values do not delete an earlier valid value.
 *
 * Grouped objects override flat keys with the same name.
 * Group field keys for transforms use "groupName.groupKey".
 */
function buildJsonObject(flatRows, groupRows, sortKeys, transformRules) {
  var obj = {};

  // --- 1) Flat fields ---
  if (flatRows && flatRows.length) {
    for (var i = 0; i < flatRows.length; i++) {
      var row = flatRows[i];
      if (!row || !row.builderKey) {
        continue;
      }

      var key = row.builderKey;
      var mapped = mapConfiguredValue(
        row.builderValue,
        row.builderType,
        'flat',
        key,
        transformRules
      );

      // undefined = skip (empty or invalid); null from null_value / set_null is kept
      if (mapped === undefined) {
        continue;
      }

      obj[key] = mapped;
    }
  }

  // --- 2) Grouped objects ---
  if (groupRows && groupRows.length) {
    var grouped = {};

    for (var j = 0; j < groupRows.length; j++) {
      var gRow = groupRows[j];
      if (!gRow || !gRow.builderGroupName || !gRow.builderGroupKey) {
        continue;
      }

      var groupName = gRow.builderGroupName;
      var gKey = gRow.builderGroupKey;
      var gMapped = mapConfiguredValue(
        gRow.builderGroupValue,
        gRow.builderGroupType,
        'group',
        groupName + '.' + gKey,
        transformRules
      );

      if (gMapped === undefined) {
        continue;
      }

      // Create group only on first valid value.
      if (!grouped[groupName]) {
        grouped[groupName] = {};
      }

      grouped[groupName][gKey] = gMapped;
    }

    if (sortKeys) {
      for (var gName in grouped) {
        grouped[gName] = sortObjectKeys(grouped[gName]);
      }
    }

    // Merge: grouped objects override same-named flat keys.
    for (var name in grouped) {
      if (objectHasOwnKeys(grouped[name])) {
        obj[name] = grouped[name];
      }
    }
  }

  // --- 3) Optional top-level key sort (deterministic output / tests only) ---
  if (sortKeys) {
    return sortObjectKeys(obj);
  }

  return obj;
}

/**
 * Debug metadata only — never log values or payloads.
 */
function debugLogSummary(obj, outputType, enabled) {
  if (!enabled) {
    return;
  }

  var topKeys = listOwnKeys(obj);
  var groupNames = [];

  for (var i = 0; i < topKeys.length; i++) {
    var k = topKeys[i];
    if (getType(obj[k]) === 'object') {
      groupNames.push(k);
    }
  }

  logToConsole(
    'JSON Object Builder - debug summary: ' +
      JSON.stringify({
        output_type: outputType,
        top_level_keys: topKeys,
        top_level_key_count: topKeys.length,
        group_names: groupNames
      })
  );
}


// ========================
// MAIN (VARIABLE RETURN)
// ========================

var flatRows = data.builderFields || [];
var groupRows = data.builderGroups || [];
var sortKeys = data.builderSortKeys === true;
var debug = data.debugLogging === true;
var outputMode = data.builderOutputMode || 'native_object';
var outputType =
  outputMode === 'json_string' ? 'json_string' : 'native_object';

var transformRules = compileTransformRules(
  data.builderTransformRuleKeys || [],
  data.builderTransformRuleActions || []
);

var obj = buildJsonObject(flatRows, groupRows, sortKeys, transformRules);

if (!objectHasOwnKeys(obj)) {
  debugLogSummary({}, outputType, debug);
  return undefined;
}

debugLogSummary(obj, outputType, debug);

if (outputType === 'json_string') {
  var encoded = JSON.stringify(obj);
  if (encoded === undefined) {
    logInvalidMappedValue('output', '', 'json_string', 'serialization_failed');
    return undefined;
  }
  return encoded;
}

// Default: native object for BigQuery Data Dispatcher overrides
return obj;
