<script>
	/** Renders text with #tags and @mentions turned into links. filterMentions makes @mentions filter the slug radio instead of visiting them. */
	import Tag from '#lib/components/tag.svelte'
	import {findTokens} from '@radio4000/sdk'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'

	/** @type {{text: string | null | undefined, slug?: string | null, filterMentions?: boolean, onTagClick?: (tag: string) => void, onMentionClick?: (slug: string) => void, deckId?: number, selectedTags?: string[]}} */
	const {text, slug, filterMentions, onTagClick, onMentionClick, deckId, selectedTags} = $props()

	// Explicit override for Tag's `filtered` state — Tag's own URL fallback only
	// understands the channel tracks page's ?tags= param, so any page with its
	// own filter model (search's ?q=, the deck queue's in-memory tags) needs to
	// say which tags are active itself.
	const selectedTagSet = $derived(new Set((selectedTags ?? []).map((t) => t.toLowerCase())))

	const parts = $derived.by(() => {
		/** @typedef {{type: 'text', content: string} | {type: 'link', content: string, value: string, href: string, isTag: boolean, filtered: boolean | undefined}} Part */
		if (typeof text !== 'string' || !text)
			return /** @type {Part[]} */ ([{type: 'text', content: ''}])

		/** @type {Part[]} */
		const parts = []
		let lastIndex = 0
		const urlTags =
			page.url.searchParams
				.get('tags')
				?.split(',')
				.filter(Boolean)
				.map((t) => t.toLowerCase()) ?? []

		for (const token of findTokens(text)) {
			// Add text before the match
			if (token.start > lastIndex) {
				parts.push({type: 'text', content: text.slice(lastIndex, token.start)})
			}
			const entity = text.slice(token.start, token.end)

			// Add the entity as a link
			const isTag = token.type === 'tag'
			let href
			if (!isTag) {
				const mention = token.value
				if (filterMentions && slug) {
					// Filter the source radio; keep its filters only if we're already on it
					const channelPath = resolve('/[slug]', {slug: encodeURIComponent(slug)})
					const onSource = [channelPath, `${channelPath}/tracks`].includes(page.url.pathname)
					// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built once per href, not state
					const params = new URLSearchParams(onSource ? page.url.search : '')
					params.set('mention', mention)
					href = `${channelPath}/tracks?${params}`
				} else {
					href = resolve('/[slug]', {slug: encodeURIComponent(mention)})
				}
			} else if (slug) {
				// Toggle: remove tag if already filtered, add if not
				const tagName = token.value
				const next = urlTags.includes(tagName)
					? urlTags.filter((t) => t !== tagName)
					: [...urlTags, tagName]
				href = next.length
					? `${resolve('/[slug]/tracks', {slug: encodeURIComponent(slug)})}?tags=${encodeURIComponent(next.join(','))}`
					: resolve('/[slug]/tracks', {slug: encodeURIComponent(slug)})
			} else {
				href = `${resolve('search')}?q=${encodeURIComponent(`#${token.value}`)}`
			}

			parts.push({
				type: 'link',
				content: entity,
				value: token.value,
				href,
				isTag,
				filtered: isTag && selectedTags !== undefined ? selectedTagSet.has(token.value) : undefined
			})

			lastIndex = token.end
		}

		// Add remaining text
		if (lastIndex < text.length) {
			parts.push({type: 'text', content: text.slice(lastIndex)})
		}

		return parts.length ? parts : /** @type {Part[]} */ ([{type: 'text', content: text}])
	})
</script>

{#each parts as part, i (i)}
	{#if part.type === 'link'}
		{#if part.isTag && onTagClick}
			<Tag
				onclick={() => onTagClick(part.value)}
				value={`#${part.value}`}
				filtered={part.filtered}
				{deckId}>{part.content}</Tag
			>
		{:else if !part.isTag && onMentionClick}
			<Tag onclick={() => onMentionClick(part.value)} {deckId}>{part.content}</Tag>
		{:else}
			<Tag
				href={part.href}
				value={part.isTag ? `#${part.value}` : undefined}
				filtered={part.filtered}
				{deckId}>{part.content}</Tag
			>
		{/if}
	{:else}
		{part.content}
	{/if}
{/each}
