# v1 data from Firebase

## Background

Background: in 2024 we launched v2 of Radio4000 with a Supabase database. You are unfortunately required to manually migrate your channel and tracks from firebase realtime db (v1) to v2.

R5 treats v1 data as read-only, but otherwise displays it in the app as any other data. Goal is to never mention any migration or v1.

Once the migration at https://github.com/radio4000/migration-2026 is complete, all v1-related code can be removed.

## How v1 channels data works

The `r4` cli repo contains a `data/channels_v1.json` which we can use. The data is already prepared for v2. Track data is still fetched on-demand from the v1 Firebase API and parsed using `@radio4000/sdk`'s `v1.parseTrack()` utility.

## Updating static/channels_v1.json

Copy the file from the CLI repo:

```bash
cp ../cli/data/channels_v1.json static/channels_v1.json
```
