<script>
	import Tag from '$lib/components/tag.svelte'
	import {trackMentionUrl} from '$lib/track-mention'
	import {ENTITY_REGEX} from '$lib/utils'
	import {base} from '$app/paths'
	import {page} from '$app/state'

	/** @type {{text: string | null | undefined, slug?: string | null, mentionSlug?: string | null, onTagClick?: (tag: string) => void, deckId?: number, selectedTags?: string[]}} */
	const {text, slug, mentionSlug, onTagClick, deckId, selectedTags} = $props()

	// Explicit override for Tag's `filtered` state — Tag's own URL fallback only
	// understands the channel tracks page's ?tags= param, so any page with its
	// own filter model (search's ?q=, the deck queue's in-memory tags) needs to
	// say which tags are active itself.
	const selectedTagSet = $derived(new Set((selectedTags ?? []).map((t) => t.toLowerCase())))

	const parts = $derived.by(() => {
		if (typeof text !== 'string') return [{type: 'text', content: ''}]
		if (!text) return [{type: 'text', content: ''}]

		const parts = []
		let lastIndex = 0
		const urlTags =
			page.url.searchParams
				.get('tags')
				?.split(',')
				.filter(Boolean)
				.map((t) => t.toLowerCase()) ?? []

		text.replace(ENTITY_REGEX, (match, prefix, entity, offset) => {
			// Add text before the match
			if (offset > lastIndex) {
				parts.push({type: 'text', content: text.slice(lastIndex, offset)})
			}

			// Add the prefix as text
			if (prefix) {
				parts.push({type: 'text', content: prefix})
			}

			// Add the entity as a link
			const isTag = entity.startsWith('#')
			const isMention = entity.startsWith('@')
			let href
			if (isMention) {
				href = mentionSlug
					? trackMentionUrl(page.url, mentionSlug, entity.slice(1), base)
					: `${base}/${encodeURIComponent(entity.slice(1))}`
			} else if (slug) {
				// Toggle: remove tag if already filtered, add if not
				const tagName = entity.slice(1).toLowerCase()
				const next = urlTags.includes(tagName)
					? urlTags.filter((t) => t !== tagName)
					: [...urlTags, tagName]
				href = next.length
					? `${base}/${encodeURIComponent(slug)}/tracks?tags=${encodeURIComponent(next.join(','))}`
					: `${base}/${encodeURIComponent(slug)}/tracks`
			} else {
				href = `${base}/search?q=${encodeURIComponent(entity)}`
			}

			parts.push({
				type: 'link',
				content: entity,
				href,
				isTag,
				filtered:
					isTag && selectedTags !== undefined
						? selectedTagSet.has(entity.slice(1).toLowerCase())
						: undefined
			})

			lastIndex = offset + match.length
			return match
		})

		// Add remaining text
		if (lastIndex < text.length) {
			parts.push({type: 'text', content: text.slice(lastIndex)})
		}

		return parts.length ? parts : [{type: 'text', content: text}]
	})
</script>

{#each parts as part, i (i)}
	{#if part.type === 'link'}
		{#if part.isTag && onTagClick}
			<Tag
				onclick={() => onTagClick(part.content.slice(1))}
				value={part.content}
				filtered={part.filtered}
				{deckId}>{part.content}</Tag
			>
		{:else}
			<Tag
				href={part.href}
				value={part.isTag ? part.content : undefined}
				filtered={part.filtered}
				{deckId}>{part.content}</Tag
			>
		{/if}
	{:else}
		{part.content}
	{/if}
{/each}
