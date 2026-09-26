# Map Audit Findings

## Root Causes Found

1. **Directions effects canceled their own requests.** Each incoming GPS update ran cleanup for the previous effect before checking its 250 m / 60 s threshold. A still-pending route was aborted, while the next effect could return early without starting another request. This accounts for intermittent markers-without-route states.
2. **The route provider silently degraded.** The browser attempted Mapbox only with `VITE_MAPBOX_TOKEN`, then fell back to public OSRM and finally a straight-line GeoJSON segment. The server credential was not involved, so production did not guarantee Mapbox road geometry.
3. **Search used unrelated fallbacks.** The browser used a public token directly or fell back to Nominatim and a curated hardcoded coordinate list. Search results and GPS selections therefore did not consistently use the backend Mapbox credential or a readable geocoded address.
4. **Map ownership was split.** `MapPreview` constructed its own Mapbox instance and rebuilt it whenever coordinates changed, while tracking used `useLiveMap`. No production screen mounted both into the same host, but the preview was a second lifecycle implementation.
5. **Tracking hid the renderer during data fetches.** An opaque full-screen order-loading layer covered the already-mounted map.
6. **Map updates could precede renderer readiness.** The shared handle initially discarded marker and route calls while the Mapbox chunk was loading, so data might not replay until another server/GPS update arrived.

## Ruled Out

- React Strict Mode alone did not create duplicate live maps: the shared hook caches the GL module and tracks instances by container in a `WeakMap`.
- Production map containers have nonzero viewport/fixed heights, inset canvas sizing, a `ResizeObserver`, and canvas recovery. The inspected CSS did not contain a zero-height rule causing the reported disappearance.
- The live route layer setup was idempotent; the failure was request cancellation/provider fallback, not repeated source creation.

## Fixes Applied

- All map surfaces now use `useLiveMap`; the shared hook queues early marker/route commands and replays them after initialization or recovery.
- The map owns one route source/layer and at most one driver arrow plus one active-stop marker. Driver GPS comes from one cleaned-up `watchPosition` hook; heading changes animate on the marker.
- Search, reverse geocoding, and Directions use backend Mapbox proxies. Directions errors preserve the map and are surfaced in delivery details; no OSRM or straight-line route fallback remains.
- Customer tracking loading/error status no longer covers the map. Saved `0,0` coordinates are rejected, search results are Ghana-bounds checked, and GPS points retain their exact coordinates with a Mapbox-readable address.

## Runtime Verification and Configuration

The headless Chrome audit passed its full observation window: the canvas stayed visible, the style loaded, two markers were present, the driver arrow rotated, and route geometry rendered. A final source check confirmed route geometry cleared from two rendered features to zero without removing the route layer or map. Portrait `390×844` and landscape `844×390` both remained correctly sized. Unmount/remount released the old map before constructing the next; Strict Mode produced sequential construction, never stacked instances. The map/style/WebGL console error report was empty. A physical GPS device and authenticated production order were not available for end-to-end verification.

The API service accepts `MAPBOX_ACCESS_TOKEN` or `MAPBOX_TOKEN` as the server-side Render credential. The workspace cannot inspect Render's configured variable name or value. A `VITE_MAPBOX_TOKEN`, if used for a Mapbox-hosted basemap, must be a restricted public browser token; it is not used by Directions or search. The PWA production build succeeded; the configured `pwa:audit` command points to a missing `scripts/pwa-audit.mjs` file.
