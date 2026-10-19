import {defineEnvVars} from '@sveltejs/kit/env'

// All optional: unset becomes an empty string and #lib/config.ts supplies the defaults.
export const variables = defineEnvVars({
	YOUTUBE_API_KEY: {schema: (input) => input ?? ''},
	PUBLIC_APP_MODE: {public: true, schema: (input) => input ?? ''},
	PUBLIC_SEED_URLS: {public: true, schema: (input) => input ?? ''},
	PUBLIC_APP_NAME: {public: true, schema: (input) => input ?? ''},
	PUBLIC_APP_SHORT_NAME: {public: true, schema: (input) => input ?? ''},
	PUBLIC_APP_URL: {public: true, schema: (input) => input ?? ''},
	PUBLIC_APP_DESCRIPTION: {public: true, schema: (input) => input ?? ''},
	PUBLIC_APP_PLAYER_URL: {public: true, schema: (input) => input ?? ''},
	PUBLIC_APP_CLOUDINARY_URL: {public: true, schema: (input) => input ?? ''},
	PUBLIC_APP_LEGAL_URL: {public: true, schema: (input) => input ?? ''},
	PUBLIC_APP_CHAT_URL: {public: true, schema: (input) => input ?? ''},
	PUBLIC_APP_DISCORD_URL: {public: true, schema: (input) => input ?? ''},
	PUBLIC_APP_SOCIAL_URL: {public: true, schema: (input) => input ?? ''},
	PUBLIC_APP_CONTACT_EMAIL: {public: true, schema: (input) => input ?? ''},
	PUBLIC_POSTHOG_KEY: {public: true, schema: (input) => input ?? ''},
	PUBLIC_POSTHOG_HOST: {public: true, schema: (input) => input ?? ''}
})
