// Shared helpers for the HTML codec.

function isEmpty(value) {
  if (value === null || value === undefined || value === '') { return true; }
  if (typeof value === 'string' && value.trim() === '') { return true; }
  if (Array.isArray(value)) { return value.length === 0; }
  if (typeof value === 'object') { return Object.keys(value).length === 0; }
  return false;
}

// Recursively strips empty leaves from a value:
//   null / undefined / '' / whitespace-only string → undefined
//   array → returns undefined if every element is empty after pruning
//   object → returns undefined if every property is empty after pruning
//   primitives → passed through unchanged
//
// Mirrors the rule the editor uses to decide what's "form-empty" in
// validation. Used by convertJsonToHtml on the save path so unused
// fields don't pollute the persisted HTML.
export function prune(value) {
  if (value === null || value === undefined || value === '') { return undefined; }
  if (typeof value === 'string' && value.trim() === '') { return undefined; }

  if (Array.isArray(value)) {
    const filtered = value.map(prune).filter((item) => !isEmpty(item));
    return filtered.length === 0 ? undefined : filtered;
  }

  if (typeof value === 'object') {
    const result = {};
    for (const [key, propertyValue] of Object.entries(value)) {
      const filtered = prune(propertyValue);
      if (filtered !== undefined && !isEmpty(filtered)) {
        result[key] = filtered;
      }
    }
    return Object.keys(result).length === 0 ? undefined : result;
  }

  return value;
}
