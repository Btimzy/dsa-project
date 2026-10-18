import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSort } from '../src/domain/sorting.js';

test('mergeSort - sorts numbers correctly in ascending order', () => {
  const input = [5, 1, 4, 2, 8];
  const sorted = mergeSort(input, (a, b) => a - b);
  assert.deepEqual(sorted, [1, 2, 4, 5, 8]);
});

test('mergeSort - returns a new array and does not mutate the original array', () => {
  const original = [3, 2, 1];
  const originalCopy = [...original];
  const result = mergeSort(original, (a, b) => a - b);

  assert.notEqual(result, original);
  assert.deepEqual(original, originalCopy);
});

test('mergeSort - handles empty array and single-item array', () => {
  assert.deepEqual(mergeSort([]), []);
  assert.deepEqual(mergeSort([42]), [42]);
});

test('mergeSort - preserves stability (equal elements retain their original relative order)', () => {
  const items = [
    { name: 'Item A', value: 10, initialIndex: 0 },
    { name: 'Item B', value: 5, initialIndex: 1 },
    { name: 'Item C', value: 10, initialIndex: 2 },
    { name: 'Item D', value: 5, initialIndex: 3 },
    { name: 'Item E', value: 10, initialIndex: 4 },
  ];

  const sorted = mergeSort(items, (a, b) => a.value - b.value);

  // For value 5: Item B (initialIndex 1) must precede Item D (initialIndex 3)
  assert.equal(sorted[0].name, 'Item B');
  assert.equal(sorted[1].name, 'Item D');

  // For value 10: Item A (0), Item C (2), Item E (4) must retain relative order
  assert.equal(sorted[2].name, 'Item A');
  assert.equal(sorted[3].name, 'Item C');
  assert.equal(sorted[4].name, 'Item E');
});

test('mergeSort - throws TypeError if inputs are invalid', () => {
  assert.throws(() => mergeSort('not an array'), TypeError);
  assert.throws(() => mergeSort([1, 2], 'not a function'), TypeError);
});
