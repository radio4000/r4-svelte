# Authentication

Supabase Auth via `sdk.supabase.auth`.

## Password reset

1. `/auth/reset-password` → user requests email
2. Click link → `PASSWORD_RECOVERY` event → redirect to `/auth/reset-password/confirm`
3. `updateUser({password})`

If "Secure password change" is enabled, call `reauthenticate()` first, then `updateUser({password, nonce})`.

## Identity linking

Requires "Enable Manual Linking" in Supabase dashboard → Auth → Settings.

Users can add/remove OAuth providers from `/settings/account`. Adding a password via `updateUser({password})` works regardless (lets OAuth-only users add password as backup).

```js
const {data} = await sdk.supabase.auth.getUserIdentities()
await sdk.supabase.auth.linkIdentity({provider: 'google', options: {redirectTo}})
await sdk.supabase.auth.unlinkIdentity(identity) // needs 2+ identities
```

## Files

- `auth-listener.svelte` - handles `INITIAL_SESSION`, `SIGNED_IN`, `PASSWORD_RECOVERY`
- `auth-login.svelte` - login form
- `/auth/reset-password/` - request reset
- `/auth/reset-password/confirm/` - set new password
- `/settings/account/` - update password, email, linked providers
