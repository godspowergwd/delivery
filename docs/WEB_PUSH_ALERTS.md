# Kitchen and driver push alerts

Push alerts are opt-in for kitchen and driver accounts. Enable them from the Kitchen queue or Driver Deliveries screen after installing/opening the site in a supported browser. The browser prompts for notification permission from that button.

## API configuration

Configure these environment variables on the API host; never commit the private key:

- `PUSH_VAPID_PUBLIC_KEY`
- `PUSH_VAPID_PRIVATE_KEY`
- `PUSH_VAPID_SUBJECT` (a `mailto:` address or HTTPS URL)

Generate a key pair with `npx web-push generate-vapid-keys`, and enter the public and private values in the API host's secret settings. Both keys are required. Restart/redeploy the API after configuring them. When the keys are missing, the app reports that background alerts are not configured and does not ask for notification permission.

The API applies the additive `20261010152000_web_push_alerts` migration on the normal deployment startup. It stores browser push subscriptions and per-order alert state; it does not modify existing accounts or orders.

## Alert behavior and device limits

- Kitchen orders repeat as push notifications every 30 seconds until the kitchen accepts the order (or it is cancelled).
- Direct driver assignments repeat until the driver taps **Accept assignment**. Reassignment or delivery completion also stops the alert.
- Push delivery is triggered by the platform push service while the browser is backgrounded or closed. The notification remains visible where supported, with vibration requested on Android.
- The device/browser controls notification sound, vibration, Focus/Do Not Disturb, volume, and background delivery. iOS push requires an installed Home Screen web app on iOS/iPadOS 16.4 or later. Neither PWA nor Web Push can force a ringtone, bypass silent/Focus settings, or guarantee a sound while the screen is off.
- Kitchen foreground audio is a separate, user-enabled browser sound and may stop if the OS suspends the page.
