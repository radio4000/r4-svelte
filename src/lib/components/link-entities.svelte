<script>
	import {ENTITY_REGEX} from '$lib/utils.ts'

	/** @type {{text: string | null | undefined, slug?: string | null}} */
	const {text, slug} = $props()

	const parts = $derived.by(() => {
		if (typeof text !== 'string') return [{type: 'text', content: ''}]
		if (!text) return [{type: 'text', content: ''}]

		const parts = []
		let lastIndex = 0

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
			const searchQuery = entity.startsWith('@') ? entity : slug ? `@${slug} ${entity}` : entity

			parts.push({
				type: 'link',
				content: entity,
				href: `/search?search=${encodeURIComponent(searchQuery)}`
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
		<a href={part.href}>{part.content}</a>
	{:else}
		{part.content}
	{/if}
{/each}
