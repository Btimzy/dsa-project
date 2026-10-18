// Custom stable Merge Sort implementation without Array.prototype.sort.
// Preserves original order for equal items (stability) and returns a new array.

function merge(left, right, compare) {
  const result = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    // When compare returns <= 0, picking left[i] ensures stability
    if (compare(left[i], right[j]) <= 0) {
      result.push(left[i]);
      i += 1;
    } else {
      result.push(right[j]);
      j += 1;
    }
  }

  while (i < left.length) {
    result.push(left[i]);
    i += 1;
  }

  while (j < right.length) {
    result.push(right[j]);
    j += 1;
  }

  return result;
}

export function mergeSort(items, compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)) {
  if (!Array.isArray(items)) {
    throw new TypeError('items must be an array');
  }
  if (typeof compare !== 'function') {
    throw new TypeError('compare must be a function');
  }

  if (items.length <= 1) {
    return items.slice();
  }

  const mid = Math.floor(items.length / 2);
  const left = mergeSort(items.slice(0, mid), compare);
  const right = mergeSort(items.slice(mid), compare);

  return merge(left, right, compare);
}
