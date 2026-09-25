import { describe, expect, it } from 'vitest';
import { relaxNumericFilters } from './map-engine';

/**
 * Mapbox GL v3 type-checks comparisons strictly; the keyless OpenFreeMap
 * styles read numeric features that are frequently absent
 * (`["<=", ["get","ref_length"], 6]` in every highway-shield layer). The
 * fixtures below are the exact filters shipped by bright / positron / liberty.
 */
describe('relaxNumericFilters (Mapbox v3 vs MapLibre-tolerant styles)', () => {
  const shieldFilter = (): unknown => [
    'all',
    ['<=', ['get', 'ref_length'], 6],
    ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
    ['match', ['get', 'network'], ['us-interstate'], true, false],
  ];

  it('makes the real shield filter null-safe without touching its other clauses', () => {
    const input = shieldFilter();
    const patched = relaxNumericFilters(input) as unknown[];

    expect(patched).not.toBe(input);
    expect(patched[1]).toEqual(['<=', ['coalesce', ['get', 'ref_length'], 999999999], 6]);
    // The other clauses are shared untouched (including by reference).
    expect(patched[2]).toBe((input as unknown[])[2]);
    expect(patched[3]).toBe((input as unknown[])[3]);
    // No strict number assertion survives anywhere in the result.
    expect(JSON.stringify(patched)).not.toContain('"number"');
  });

  it('rewrites the asserted form the compiler may serialize back', () => {
    expect(relaxNumericFilters(['<', ['number', ['get', 'ref_length']], 6])).toEqual([
      '<',
      ['coalesce', ['get', 'ref_length'], 999999999],
      6,
    ]);
  });

  it('rewrites the legacy filter form', () => {
    expect(relaxNumericFilters(['<=', 'ref_length', 6])).toEqual([
      '<=',
      ['coalesce', ['get', 'ref_length'], 999999999],
      6,
    ]);
  });

  it('uses a lower sentinel so `>` / `>=` gates also reject a missing value', () => {
    expect(relaxNumericFilters(['>', ['get', 'ref_length'], 0])).toEqual([
      '>',
      ['coalesce', ['get', 'ref_length'], -999999999],
      0,
    ]);
    expect(relaxNumericFilters(['>=', ['get', 'ref_length'], 1])).toEqual([
      '>=',
      ['coalesce', ['get', 'ref_length'], -999999999],
      1,
    ]);
  });

  it('rejects a missing value for `==` (a failed evaluation matched nothing)', () => {
    expect(relaxNumericFilters(['==', ['get', 'ref_length'], 3])).toEqual([
      '==',
      ['coalesce', ['get', 'ref_length'], 999999999],
      3,
    ]);
  });

  it('leaves `!=` and string comparisons exactly as the style ships them', () => {
    const notEqual = ['!=', ['get', 'ramp'], 1];
    expect(relaxNumericFilters(notEqual)).toBe(notEqual);

    const stringCmp = ['==', ['get', 'class'], 'motorway'];
    expect(relaxNumericFilters(stringCmp)).toBe(stringCmp);

    const hasCmp = ['has', 'ref_length'];
    expect(relaxNumericFilters(hasCmp)).toBe(hasCmp);
  });

  it('never mutates or rewraps unrelated expressions (identity for no-ops)', () => {
    const interpolate = ['interpolate', ['linear'], ['zoom'], 0, 1, 16, 10];
    expect(relaxNumericFilters(interpolate)).toBe(interpolate);

    const plainObject = { not: 'an expression' };
    expect(relaxNumericFilters(plainObject)).toBe(plainObject);

    // An `all` whose clauses are all fine comes back untouched, by reference.
    const clean = ['all', ['==', ['get', 'class'], 'motorway'], ['has', 'bridge']];
    expect(relaxNumericFilters(clean)).toBe(clean);
  });

  it('preserves the original input (pure function)', () => {
    const input = shieldFilter();
    const snapshot = JSON.stringify(input);
    relaxNumericFilters(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});