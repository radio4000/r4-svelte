<script>
	import IconR4 from '$lib/components/icon-r4.svelte'

	/** @type {{text?: string, value?: number, max?: number}} */
	let {text, value, max} = $props()

	const sentences = [
		{text: 'Unu momenton, mi petas', lang: 'Esperanto'},
		{text: 'Un momento por favor', lang: 'Spanish'},
		{text: 'لحظة واحدة من فضلك', lang: 'Arabic'},
		{text: 'Один момент, пожалуйста', lang: 'Russian'},
		{text: 'Une batez, mesedez', lang: 'Basque'},
		{text: 'এক মিনিট, প্লিজ', lang: 'Bengali'},
		{text: '稍等一会儿', lang: 'Chinese'},
		{text: 'Et øjeblik', lang: 'Danish'},
		{text: 'Een ogenblik alstublieft', lang: 'Dutch'},
		{text: 'Unu momenton, bonvolu', lang: 'Esperanto'},
		{text: 'Hetkinen', lang: 'Finnish'},
		{text: "Un instant s'il vous plaît", lang: 'French'},
		{text: 'Einen Moment bitte', lang: 'German'},
		{text: 'Μια στιγμή παρακαλώ', lang: 'Greek'},
		{text: 'Yon sèl moman, tanpri', lang: 'Haitian Creole'},
		{text: 'कृपया एक क्षण', lang: 'Hindi'},
		{text: 'Nóiméad amháin, le do thoil', lang: 'Irish'},
		{text: 'Un momento per favore', lang: 'Italian'},
		{text: '少々お待ちください', lang: 'Japanese'},
		{text: 'Uno momento, placet', lang: 'Latin'},
		{text: 'Един момент моля', lang: 'Bulgarian'},
		{text: 'Et øyeblikk', lang: 'Norwegian'},
		{text: 'Chwileczkę', lang: 'Polish'},
		{text: 'Um momento por favor', lang: 'Portuguese'},
		{text: 'Wakati mmoja, tafadhali', lang: 'Swahili'},
		{text: 'Ett ögonblick tack', lang: 'Swedish'},
		{text: 'กรุณารอสักครู่', lang: 'Thai'},
		{text: 'Bir dakika lütfen', lang: 'Turkish'},
		{text: 'Un funud, os gwelwch yn dda', lang: 'Welsh'},
		{text: 'Omunye mzuzu, sicela', lang: 'Zulu'},
	]

	const random = sentences[Math.floor(Math.random() * sentences.length)]
	const displayText = $derived(text || random.text)
	const displayLang = $derived(text ? undefined : random.lang)
</script>

<div class="r4-loading">
	<span class="logo"><IconR4 /></span>
	<span title={displayLang}>{displayText}</span>
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
			display: contents;
			color: var(--accent-9);
			:global(svg) {
				width: 2rem;
				height: auto;
				display: block;
			}
		}
	}
</style>
