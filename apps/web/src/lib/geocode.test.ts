import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentLocationPlace, suggestPlaces } from './geocode';

afterEach(() => vi.unstubAllGlobals());

describe('Mapbox location autocomplete', () => {
  it('waits for Mapbox-backed suggestions when the query is long enough', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      suggestions: [{
        label: 'Mallam Junction',
        address: 'Mallam Junction, Accra, Ghana',
        latitude: 5.5774,
        longitude: -0.3104,
        placeId: 'place.1',
        type: 'poi',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const suggestions = await suggestPlaces('Mallam junction');

    expect(suggestions).toEqual([{
      id: 'mapbox:place.1',
      label: 'Mallam Junction',
      address: 'Mallam Junction, Accra, Ghana',
      lat: 5.5774,
      lng: -0.3104,
      source: 'mapbox',
      kind: 'landmark',
    }]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/geo/search?q=Mallam%20junction');
  });

  it('does not issue a search for fewer than three characters', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(suggestPlaces('Ma')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects coordinates outside Ghana rather than producing a customer pin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      suggestions: [{
        label: 'Somewhere else',
        address: 'Somewhere else',
        latitude: 0,
        longitude: 0,
        placeId: 'place.invalid',
        type: 'place',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(suggestPlaces('Somewhere else')).resolves.toEqual([]);
  });

  it('stores the exact GPS point with Mapbox reverse-geocoded address text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      suggestion: {
        label: 'Mallam Junction',
        address: 'Mallam Junction, Accra, Ghana',
        latitude: 5.5774,
        longitude: -0.3104,
        placeId: 'address.2',
        type: 'poi',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(currentLocationPlace({ lat: 5.57741, lng: -0.31041 })).resolves.toMatchObject({
      label: 'Mallam Junction',
      address: 'Mallam Junction, Accra, Ghana',
      lat: 5.57741,
      lng: -0.31041,
      source: 'gps',
    });
  });

  it('keeps the exact GPS point usable offline when reverse geocoding is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network unavailable')));

    await expect(currentLocationPlace({ lat: 5.57741, lng: -0.31041 })).resolves.toMatchObject({
      label: 'My Location',
      address: 'GPS 5.577410, -0.310410',
      lat: 5.57741,
      lng: -0.31041,
      source: 'gps',
    });
  });
});