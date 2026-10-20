# Authentication

Supabase Auth via `sdk.supabase.auth`. See `@radio4000/sdk` in docs/reference.json for methods.

## Sign up/in

OAuth (Google, Facebook) or email. The email flow sends a magic link via `signInWithOtp` — after the email is sent, users can also enter a 6-digit OTP code instead of clicking the link (`verifyOtp`). Login additionally supports password; password signup exists in code but is disabled in the UI.

## Password reset

`/auth/reset-password` → email → `PASSWORD_RECOVERY` event → `/auth/reset-password/confirm` → `updateUser({password})`.

## Identity linking

Users add/remove OAuth providers from `/account`. Requires "Enable Manual Linking" in Supabase dashboard. Need 2+ identities to unlink one.

## Routes

- `/auth` - user entry point
- `/auth/login` — magic link, OTP code, password, OAuth
- `/auth/create-account` — magic link, OTP code, OAuth
- `/auth/reset-password` — request reset email
- `/auth/reset-password/confirm` — set new password
- `/account` — email, providers, logout, delete link
- `/account/password` — change password
- `/account/email` — change email
- `/account/delete` — delete account

## Components

- `auth-listener.svelte` — in layout.svelte (always active), subscribes to Supabase auth changes and updates appState. On `INITIAL_SESSION` and a new `SIGNED_IN` it calls `checkUser(session.user)`: one `channels_with_tracks` query joined on `user_channel`, no `getUser()` round trip. Boot trusts the local session; RLS guards writes.
- `auth-login.svelte` — login form (magic link → OTP, password, OAuth via auth-providers)
- `auth-signup.svelte` — signup form (magic link → OTP, OAuth via auth-providers)
- `auth-providers.svelte` — OAuth buttons (Google, Facebook) + email entry point
- `r4-password-reset.svelte` — password reset email form
