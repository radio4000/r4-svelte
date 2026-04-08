# Spam angel

Community-driven spam detection and channel moderation. Surfaces bad-faith content through user reports, hides it automatically once the signal is strong enough, and gives admins a queue to review and act.

## Problem

SEO operators manually create accounts, add channels, and fill them with tracks whose URLs point to arbitrary websites rather than music. The content looks legitimate at signup but the intent is link placement, not radio curation.

Deleting on sight is too aggressive — false positives hurt real users and the action is irreversible. The goal is to hide content from public views quickly, keep it recoverable, and let admins act with full context.

## Data model

### `channels.hidden_at`

A nullable `timestamptz` column on `channels`. Null means visible. A timestamp means the channel is hidden — excluded from all public queries, but the row is intact.

```sql
ALTER TABLE channels ADD COLUMN hidden_at timestamptz;
```

Hidden channels are still readable by their owner so they can see the review notice.

### `reports` table

One row per (reporter, channel) pair. Requires authentication. No reason field — the action is "this channel is spam", not a category selection.

```sql
CREATE TABLE public.reports (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id  uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE (reporter_id, channel_id)
);
```

RLS: authenticated users can insert their own reports. Only service role can select (the mod queue is admin-only). No update or delete for users.

## Automation

A Postgres trigger fires after each insert into `reports`. If the channel has reached 10 distinct reporters and is not already hidden, it sets `hidden_at`:

```sql
CREATE OR REPLACE FUNCTION check_report_threshold()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE channels
  SET hidden_at = now()
  WHERE id = NEW.channel_id
    AND hidden_at IS NULL
    AND (
      SELECT COUNT(DISTINCT reporter_id)
      FROM reports
      WHERE channel_id = NEW.channel_id
    ) >= 10;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_report_insert
AFTER INSERT ON reports
FOR EACH ROW EXECUTE FUNCTION check_report_threshold();
```

The threshold of 10 is a starting point. It can be raised or lowered by changing the trigger function without touching application code.

## Public visibility

All views and queries that return channels to the public filter on `hidden_at IS NULL`. This includes `channels_with_tracks`, `random_channels_with_tracks`, search, and any direct channel lookups from anonymous or authenticated non-owner sessions.

The channel page fetches the channel regardless of `hidden_at` for the owner, so they can see their content and the review notice.

## Owner experience

When a channel owner visits their channel and `hidden_at` is set, the channel page shows an inline notice:

> "This channel is under review. It is not visible to others. Contact us if you think this is a mistake."

No email or push notification at this stage. The owner discovers it on their next visit.

## Report UX

A low-key "Report spam" action appears on every channel page for authenticated users who do not own the channel. One click, no form. If the current user has already reported that channel, the action shows "Reported" and is disabled.

The action inserts a row into `reports`. If the threshold is reached, hiding happens immediately via the trigger.

## Admin `/spam` route

A route at `/spam` (or `/admin`) visible only to admins. Shows:

**Stats**

- Total hidden channels
- Total reports (all time)
- Channels hidden in the last 7 days

**Moderation queue**
Channels ordered by report count descending. Per row: slug, name, report count, `hidden_at`, date of first and most recent report.

**Actions per channel**

- **Restore** — clears `hidden_at`, deletes the channel's reports. For false positives.
- **Ban** — calls the existing `ban_user_by_channel_slug()` function. For confirmed spam. This deletes the channel and blocks the account.

Admin identity is checked server-side. Non-admin requests to the route return 403.

## Open questions

- **Owner notification** — the in-app banner covers discovery on next visit. A more proactive notification (email, in-app badge) would help owners who don't check frequently. Not implemented yet.
- **Threshold tuning** — 10 reports is a starting point for a small community. Monitor false positive and false negative rates and adjust.
- **Appeal path** — owners currently have no self-service way to contest a review decision. A contact link in the notice is the minimum; a formal appeal flow is future work.
- **Track-level hiding** — hiding the whole channel is the right default. Individual track flagging would add granularity but also complexity. Revisit if the spam pattern shifts to channel-level legitimate content with isolated bad tracks.
