# Delivery Location Audit

## Data Flow

- Checkout treats a search/GPS pick as a candidate. It is previewed on the existing shared `MapPreview`/`useLiveMap` implementation and is not submitted until the customer presses **Confirm delivery location**.
- Confirmation writes a per-customer snapshot to local storage: final delivery coordinates, readable address/label, source (`gps` or `search`), confirmation timestamp, and the original GPS coordinates when GPS was used.
- Order submission uses only that confirmed snapshot. It never reads a live customer GPS watcher. The customer tracking screen also uses the order DTO destination, not customer device GPS.
- Driver navigation uses `DriverMap`'s live device fix as route origin and the selected order's persisted `deliveryLatitude`/`deliveryLongitude` as its target. Customer movement cannot change the order destination.
- Search selection uses Mapbox geocoding results with coordinates. `My Location` requests one `getCurrentPosition` fix (no watch); reverse geocoding supplies the address but retains the exact captured GPS coordinates. If reverse geocoding is offline, the exact coordinates remain available for confirmation.

## Persistence and Offline Retry

The migration adds nullable `deliveryLocationSource`, `deliveryLocationConfirmedAt`, original GPS coordinate fields, and a unique nullable `clientRequestId`. Nullable additions leave existing rows intact. New UI orders send the captured confirmation snapshot. A client-generated idempotency key means a retry after a lost response returns the existing order instead of creating a duplicate/decrementing inventory twice.

Confirmed locations are saved locally per customer before order submission. An explicit pre-order location change replaces that customer's current draft. When an order POST fails due to offline/network/server availability, the full order request and the same destination are saved locally. An app-level synchronizer retries on the browser `online` event or when the app reopens online; Checkout also offers **Retry sync now**. The queued order's location/contact/payment controls are frozen until sync completes. The submitted snapshot and queue are cleared after the API confirms an order. No production database was reset or modified during development verification; the additive migration must run through the normal Render migration deployment.

## Verification

- Unit tests validate coordinate/source/time persistence and per-customer queue isolation.
- A simulated GPS reverse-geocode network failure retains the original one-shot fix.
- API and frontend type/build checks verify the DTO, schema, serializer, and client payload contract.
- The driver route code uses order coordinates as destination and live driver coordinates as origin.
- Real browser permission/GPS movement and a live authenticated Supabase order were not available here; production verification should exercise the five requested scenarios after the migration is deployed.
