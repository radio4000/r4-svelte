<script>
	import IconR4 from '$lib/components/icon-r4.svelte'

	/** @type {{text?: string, value?: number, max?: number}} */
	let {text, value, max} = $props()

	const sentences = [
		'Unu momenton, mi petas',
		'Un momento por favor',
		'لحظة واحدة من فضلك',
		'Один момент, пожалуйста',
		'Une batez, mesedez',
		'এক মিনিট, প্লিজ',
		'稍等一会儿',
		'Et øjeblik',
		'Een ogenblik alstublieft',
		'Unu momenton, bonvolu',
		'Hetkinen',
		"Un instant s'il vous plaît",
		'Einen Moment bitte',
		'Μια στιγμή παρακαλώ',
		'Yon sèl moman, tanpri',
		'कृपया एक क्षण',
		'Nóiméad amháin, le do thoil',
		'Un momento per favore',
		'少々お待ちください',
		'Uno momento, placet',
		'Един момент моля',
		'Et øyeblikk',
		'Chwileczkę',
		'Um momento por favor',
		'Wakati mmoja, tafadhali',
		'Ett ögonblick tack',
		'กรุณารอสักครู่',
		'Bir dakika lütfen',
		'Un funud, os gwelwch yn dda',
		'Omunye mzuzu, sicela'
	]

	const randomSentence = sentences[Math.floor(Math.random() * sentences.length)]
	const displayText = $derived(text || randomSentence)
</script>

<div class="r4-loading">
	<span class="logo"><IconR4 /></span>
	{displayText}
	{#if value && max}
		<progress {value} {max}></progress>
	{:else}
		<progress></progress>
	{/if}
</div>

<style>
	.r4-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;

		.logo {
			display: flex;
			color: var(--accent-9);
			:global(svg) {
				width: 2rem;
				height: auto;
			}
		}
	}
</style>
