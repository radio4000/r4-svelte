# Spam angel

Spam detection and moderation. Admins find suspected spam channels and quarantine their accounts; nothing is deleted until 30 days have passed, so a mistake can be undone.

## Problem

SEO operators manually create accounts, add channels, and fill them with tracks whose URLs point to arbitrary websites rather than music. The content looks legitimate at signup but the intent is link placement, not radio curation.

Deleting on sight is too aggressive — false positives hurt real users and the action is irreversible. The goal is to hide content from public views quickly, keep it recoverable, and let admins act with full context.

## Quarantine

The database does the moderation. Quarantine is the one way, and it acts on the account behind a channel slug, all of its channels included. Details in radio4000/supabase `docs/moderation.md`.

- **Admins** have `"admin": true` in their `app_metadata`, set by the database owners in the dashboard SQL editor. No client holds the service role key.
- **Quarantine** (`quarantine_user_by_channel_slug`) hides the account's channels, tracks and follows from everyone but admins, and blocks its sign in for 30 days.
- **Release** (`release_user_by_channel_slug`) undoes it.
- **Purge**: a daily job deletes accounts quarantined for more than 30 days.
- **Queue** (`quarantined_accounts`): each quarantined account, its channels, who quarantined it, and when it will be purged.

## The `/docs/spam-angel` page

For admins only; others see what it is for. `spam-detector.js` scores channels with fewer than 10 tracks (spam words, links that aren't music), and you review them with the keyboard: `s` quarantines the channel's account, `e` keeps it, `u` undoes the last one (releasing a quarantine).

The Quarantined column comes from the database, whoever quarantined the accounts, with their deletion day and a Release button. Kept channels stay in this browser.

## Owner experience

A quarantined owner can't sign in: Supabase answers `user_banned`. The sign-in form should say "Your account is under review" with a contact address. Not implemented yet.

## Next

- **Reports**: a "Report spam" action on channel pages for signed-in users, feeding the admins' queue. Whether enough reports should quarantine automatically is open: quarantine also blocks sign in, so false reports would cost a real user more than hiding a channel.
- **Release in the page**: today, admins release from the SQL editor or r4.el.
- **Appeal path**: a contact link in the sign-in notice is the minimum.
