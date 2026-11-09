import assert from 'node:assert/strict';
import { gradeEvSchema } from '../src/lib/schemas/grading.ts';
const valid = { rawCardValue: 10, gradingCost: 5, psa10Value: 100, psa9Value: 40,
  psa8Value: 15, probabilityPsa10: 50, probabilityPsa9: 30, probabilityPsa8: 20,
  marketplaceFeePct: 10, shippingCost: 2, insuranceCost: 0, taxAdjustment: 0 };
assert.deepEqual(gradeEvSchema.parse(valid), valid);
assert.deepEqual(gradeEvSchema.parse(Object.fromEntries(Object.entries(valid).map(([key, value]) => [key, String(value)]))), valid);
assert.equal(gradeEvSchema.safeParse({ ...valid, probabilityPsa10: 70 }).success, false);
assert.equal(gradeEvSchema.safeParse({ ...valid, rawCardValue: 0 }).success, false);
assert.equal(gradeEvSchema.safeParse({ ...valid, shippingCost: -1 }).success, false);
assert.equal(gradeEvSchema.safeParse({ ...valid, rawCardValue: 'invalid' }).success, false);
assert.equal(gradeEvSchema.safeParse({ ...valid, rawCardValue: Infinity }).success, false);
console.log('Grading schema coercion and validation checks passed');

const { zodResolver } = await import('@hookform/resolvers/zod');
const resolver = zodResolver(gradeEvSchema);
const options = { criteriaMode: 'all', fields: {}, shouldUseNativeValidation: false };
const resolved = await resolver(valid, undefined, options);
assert.deepEqual(resolved.errors, {});
assert.deepEqual(resolved.values, valid);
const rejected = await resolver({ ...valid, rawCardValue: -1 }, undefined, options);
assert.ok(rejected.errors.rawCardValue);
assert.deepEqual(rejected.values, {});
console.log('React Hook Form resolver accepts valid input and returns validation errors');
