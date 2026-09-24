import { describe, expect, it } from 'vitest';
import { rankLocalPlaces, suggestPlaces } from './geocode';

/**
 * The location search must behave like a real place autocomplete: typing
 * "Mal…" instantly offers the Mallam landmarks the delivery zone is built
 * around, long before any network round-trip.
 */
describe('location autocomplete (Mallam-first ranking)', () => {
  it('puts Mallam landmarks on top for "Mal"', () => {
    const results = rankLocalPlaces('Mal');
    expect(results.length).toBeGreaterThan(2);
    expect(results[0].startsWith('Mallam')).toBe(true);
    expect(results).toContain('Mallam Junction');
    expect(results).toContain('Mallam Market');
    expect(results).toContain('Mallam Gbawe Road');
  });

  it('ranks the junction first for a two-word prefix', () => {
    expect(rankLocalPlaces('mallam j')[0]).toBe('Mallam Junction');
  });

  it('matches whole words, not only prefixes', () => {
    expect(rankLocalPlaces('gbawe')).toContain('Mallam Gbawe Road');
  });

  it('needs at least two characters before suggesting', () => {
    expect(rankLocalPlaces('m')).toEqual([]);
  });

  it('returns ranked suggestions (and never throws) for a neighbourhood', () => {
    const results = rankLocalPlaces('kaneshie');
    expect(results[0]).toBe('Kaneshie');
    expect(results).toContain('Kaneshie Market');
  });

  it('suggestPlaces resolves instantly from the local dataset without any network', async () => {
    const results = await suggestPlaces('Mallam');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe('local');
    expect(results[0].label.startsWith('Mallam')).toBe(true);
  });
});