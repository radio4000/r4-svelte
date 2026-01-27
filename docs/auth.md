# Authentication

Supabase Auth via `sdk.supabase.auth`. See `@radio4000/sdk` in docs/overview.json for methods.

## Sign up/in

OAuth (Google, Facebook) or email (magic link or password).

## Password reset

`/auth/reset-password` → email → `PASSWORD_RECOVERY` event → `/auth/reset-password/confirm` → `updateUser({password})`.

## Identity linking

Users add/remove OAuth providers from `/settings/account`. Requires "Enable Manual Linking" in Supabase dashboard. Need 2+ identities to unlink one.

## Routes

- `/auth` - user entry point
- `/auth/login` — magic link, password, OAuth
- `/auth/create-account` — magic link, OAuth
- `/auth/reset-password` — request reset email
- `/auth/reset-password/confirm` — set new password
- `/settings/account` — email, providers, logout, delete link
- `/settings/account/password` — change password
- `/settings/account/email` — change email
- `/settings/account/delete` — delete account

## Components

- `auth-listener.svelte` — is part of layout.svelte, handles session events, redirects
- `auth-login.svelte` — login form
- `auth-signup.svelte` — signup form
- `auth-providers.svelte` — OAuth buttons
