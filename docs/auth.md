# Authentication

Supabase Auth via `sdk.supabase.auth`. See `@radio4000/sdk` in docs/overview.json for methods.

## Sign up/in

OAuth (Google, Facebook) or email. The email flow sends a magic link via `signInWithOtp` — after the email is sent, users can also enter a 6-digit OTP code instead of clicking the link (`verifyOtp`). Login additionally supports password; password signup exists in code but is disabled in the UI.

## Password reset

`/auth/reset-password` → email → `PASSWORD_RECOVERY` event → `/auth/reset-password/confirm` → `updateUser({password})`.

## Identity linking

Users add/remove OAuth providers from `/settings/account`. Requires "Enable Manual Linking" in Supabase dashboard. Need 2+ identities to unlink one.

## Routes

- `/auth` - user entry point
- `/auth/login` — magic link, OTP code, password, OAuth
- `/auth/create-account` — magic link, OTP code, OAuth
- `/auth/reset-password` — request reset email
- `/auth/reset-password/confirm` — set new password
- `/settings/account` — email, providers, logout, delete link
- `/settings/account/password` — change password
- `/settings/account/email` — change email
- `/settings/account/delete` — delete account

## Components

- `auth-listener.svelte` — in layout.svelte (always active), subscribes to Supabase auth changes and updates appState
- `auth-login.svelte` — login form (magic link → OTP, password, OAuth via auth-providers)
- `auth-signup.svelte` — signup form (magic link → OTP, OAuth via auth-providers)
- `auth-providers.svelte` — OAuth buttons (Google, Facebook) + email entry point
- `r4-password-reset.svelte` — password reset email form
