<script>
	import {ENTITY_REGEX} from '$lib/utils.ts'

	/** @type {{text: string | null | undefined, slug?: string | null, onTagClick?: (tag: string) => void}} */
	const {text, slug, onTagClick} = $props()

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
			const isTag = entity.startsWith('#')
			const isMention = entity.startsWith('@')
			const href = isMention
				? `/${encodeURIComponent(entity.slice(1))}`
				: `/search?q=${encodeURIComponent(slug ? `@${slug} ${entity}` : entity)}`

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
			<button class="ghost tag-link" onclick={() => onTagClick(part.content)}>{part.content}</button>
		{:else}
			<a href={part.href}>{part.content}</a>
		{/if}
	{:else}
		{part.content}
	{/if}
{/each}

<style>
	.tag-link {
		min-height: 0;
		padding: 0;
		font: inherit;
		color: inherit;
		text-decoration: underline;
	}
</style>
