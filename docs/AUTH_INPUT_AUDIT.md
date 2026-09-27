# Authentication Input Audit

## Scope

Scanned application source under `apps/web/src`, `apps/web/public`, `apps/api/src`, and `packages` for password/email/username input types, `name`, `id`, autocomplete tokens, forms, `FormData`, password state, dynamic input types, and reusable input wrappers. No credential forms were found in API/shared packages or static HTML.

## Credential Inputs

| Surface / file | Input | Final type | Final name | Final id | Autocomplete | State / submission |
| --- | --- | --- | --- | --- | --- | --- |
| Main login, `apps/web/src/pages/Login.tsx` | Email or username | `text` | `username` | `login-identifier` | `username` | Controlled by `email`; submitted as `payload.email` |
| Main login, `apps/web/src/pages/Login.tsx` | Password | `password` | `password` | `login-password` | `current-password` | Controlled by `password`; submitted as `payload.password` |
| Guest sign-in sheet, `apps/web/src/components/AuthSheet.tsx` | Email or username | `text` | `username` | `authsheet-identifier` | `username` | Controlled by `email`; submitted as `payload.email` |
| Guest sign-in sheet, `apps/web/src/components/AuthSheet.tsx` | Password | `password` | `password` | `authsheet-password` | `current-password` | Controlled by `password`; submitted as `payload.password` |
| Customer registration, `apps/web/src/pages/Register.tsx` | Email | `email` | `email` | `register-email` | `email` | Controlled by `form.email`; submitted as `payload.email` |
| Customer registration, `apps/web/src/pages/Register.tsx` | New password | `password` | `newPassword` | `register-password` | `new-password` | Controlled by `form.password`; mapped to API `payload.password` |

The two login forms use distinct IDs and each is ordered username first, password second. The guest sheet's `Modal` returns `null` when closed, so its controls do not remain hidden beside the main login form. Registration has no confirm-password field. No password reset, password-change, PIN, or staff-specific credential form exists in the scanned UI; all roles use the shared main login form.

## Other Email Inputs

These are business contact settings, not authentication credentials. They were made explicit email fields and excluded from personal credential autofill.

| Surface / file | Final type | Final name | Final id | Autocomplete |
| --- | --- | --- | --- | --- |
| Admin business settings, `apps/web/src/pages/admin/Settings.tsx` | `email` | `businessEmail` | `business-email` | `off` |
| Admin support settings, `apps/web/src/pages/admin/Settings.tsx` | `email` | `supportEmail` | `support-email` | `off` |

## Findings and Changes

- Main login and guest-sheet field types, names, IDs, autocomplete, separate React state, and API payload mapping were already correct; retained them.
- Registration email/password previously lacked explicit names and IDs; its labels also relied on implicit wrapping. Added semantic names, unique IDs, explicit `htmlFor` targets, and `autoComplete="on"` to the form. Kept the existing controlled state and API payload unchanged.
- Admin business/support emails previously defaulted to text fields without names or IDs. Added email types, semantic names, unique IDs, explicit label targets, and `autocomplete="off"`.
- The reusable `Input` component forwards native input props unchanged. `Field` renders the supplied `htmlFor` and wraps its child, so explicit label associations are preserved.
- No duplicate or conflicting credential form component was removed. The main login and guest sheet are distinct intended flows; the closed sheet unmounts its form.

## Verification

- Frontend typecheck passed after the field changes.
- Browser inspection confirmed the main login and guest sheet each render username/password inputs with the listed semantics, valid form ownership, associated labels, and no duplicate IDs.
- Browser-filled login values were sent through an intercepted `/auth/login` request; its JSON keys were `email`, `password`, and `rememberMe`, and both credentials matched their respective fields. Registration was similarly intercepted; its submitted email and password matched their own controlled inputs.
- The browser test used Playwright field filling to exercise autofill-style input/change events. This environment has no saved password-manager profile, so it does not claim to test a real stored credential autofill selection. No request reached the backend and no account/password data was changed.
- The mock 400 responses were deliberate test interceptions, not application authentication errors.
