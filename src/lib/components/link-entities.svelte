<script>
	import Tag from '$lib/components/tag.svelte'
	import {ENTITY_REGEX} from '$lib/utils'
	import {base} from '$app/paths'
	import {page} from '$app/state'

	/** @type {{text: string | null | undefined, slug?: string | null, onTagClick?: (tag: string) => void}} */
	const {text, slug, onTagClick} = $props()

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
				href = `${base}/${encodeURIComponent(entity.slice(1))}`
			} else if (slug) {
				// Toggle: remove tag if already filtered, add if not
				const tagName = entity.slice(1).toLowerCase()
				const next = urlTags.includes(tagName) ? urlTags.filter((t) => t !== tagName) : [...urlTags, tagName]
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
				isTag
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
			<Tag onclick={() => onTagClick(part.content.slice(1))} value={part.content}>{part.content}</Tag>
		{:else}
			<Tag href={part.href} value={part.isTag ? part.content : undefined}>{part.content}</Tag>
		{/if}
	{:else}
		{part.content}
	{/if}
{/each}
