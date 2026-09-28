import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/errors';
import { getMapboxRoadRoute, reverseMapboxAddress, searchMapboxAddresses } from './mapbox.service';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Mapbox service', () => {
  it('searches Mapbox and returns readable addresses with coordinates', async () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'server-only-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{
          id: 'address.1',
          text: 'Mallam Junction',
          place_name: 'Mallam Junction, Accra, Ghana',
          center: [-0.3104, 5.5774],
          place_type: ['poi'],
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchMapboxAddresses('Mallam')).resolves.toEqual([{
      label: 'Mallam Junction',
      address: 'Mallam Junction, Accra, Ghana',
      latitude: 5.5774,
      longitude: -0.3104,
      placeId: 'address.1',
      type: 'poi',
    }]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('access_token=server-only-token');
  });

  it('returns full road geometry from Mapbox Directions only', async () => {
    vi.stubEnv('MAPBOX_TOKEN', 'server-only-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{
          geometry: { coordinates: [[-0.31, 5.57], [-0.30, 5.58]] },
          distance: 2500,
          duration: 600,
          legs: [{ steps: [{
            distance: 1200,
            duration: 300,
            maneuver: { instruction: 'Turn right onto Mallam Road', location: [-0.305, 5.575] },
          }] }],
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMapboxRoadRoute(
      { latitude: 5.57, longitude: -0.31 },
      { latitude: 5.58, longitude: -0.30 },
    )).resolves.toEqual({
      coordinates: [[-0.31, 5.57], [-0.30, 5.58]],
      distanceKm: 2.5,
      durationMin: 10,
      legs: [{
        distanceKm: 1.2,
        durationMin: 5,
        steps: [{
          instruction: 'Turn right onto Mallam Road',
          distanceKm: 1.2,
          durationMin: 5,
          location: [-0.305, 5.575],
          distanceFromStartKm: 0,
        }],
      }],
      steps: [{
        instruction: 'Turn right onto Mallam Road',
        distanceKm: 1.2,
        durationMin: 5,
        location: [-0.305, 5.575],
        distanceFromStartKm: 0,
      }],
      road: true,
      provider: 'mapbox',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/directions/v5/mapbox/driving/');
    expect(String(fetchMock.mock.calls[0][0])).toContain('steps=true');
    expect(String(fetchMock.mock.calls[0][0])).toContain('geometries=geojson');
    expect(String(fetchMock.mock.calls[0][0])).toContain('overview=full');
  });

  it('reverse-geocodes GPS coordinates to a readable address without changing the point', async () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'server-only-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{
          id: 'address.2',
          text: 'Mallam Junction',
          place_name: 'Mallam Junction, Accra, Ghana',
          center: [-0.31, 5.58],
          place_type: ['poi'],
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(reverseMapboxAddress(5.5774, -0.3104)).resolves.toMatchObject({
      address: 'Mallam Junction, Accra, Ghana',
      latitude: 5.5774,
      longitude: -0.3104,
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/geocoding/v5/mapbox.places/-0.3104,5.5774.json');
  });

  it('surfaces Directions failures instead of substituting a different route', async () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'server-only-token');
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMapboxRoadRoute(
      { latitude: 5.57, longitude: -0.31 },
      { latitude: 5.58, longitude: -0.30 },
    )).rejects.toMatchObject({ statusCode: 502, code: 'MAPBOX_UPSTREAM_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects route geometry outside valid longitude/latitude bounds', async () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'server-only-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{ geometry: { coordinates: [[-0.31, 5.57], [181, 5.58]] }, distance: 1000, duration: 120 }],
      }),
    }));

    await expect(getMapboxRoadRoute(
      { latitude: 5.57, longitude: -0.31 },
      { latitude: 5.58, longitude: -0.30 },
    )).rejects.toMatchObject({ statusCode: 404, code: 'NO_ROUTE' });
  });

  it('fails explicitly when the server token is missing instead of drawing a fallback line', async () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', '');
    vi.stubEnv('MAPBOX_TOKEN', '');
    vi.stubGlobal('fetch', vi.fn());

    await expect(searchMapboxAddresses('Mallam')).rejects.toMatchObject({
      statusCode: 503,
      code: 'MAPBOX_TOKEN_MISSING',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a specific configuration error for Directions when no server token exists', async () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', '');
    vi.stubEnv('MAPBOX_TOKEN', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMapboxRoadRoute(
      { latitude: 5.57, longitude: -0.31 },
      { latitude: 5.58, longitude: -0.30 },
    )).rejects.toMatchObject({ statusCode: 503, code: 'MAPBOX_TOKEN_MISSING' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});