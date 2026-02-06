<script>
	import {
		IconAdd,
		IconArrowDown,
		IconArrowUp,
		IconHtml,
		IconCodeBranch,
		IconChartScatter,
		IconCircleInfo,
		IconClose,
		IconCode,
		IconDelete,
		IconDocumentDownload,
		IconEject,
		IconFavorite,
		IconFavoriteFill,
		IconFilterAlt,
		IconFullscreen,
		IconFunnelAscending,
		IconFunnelDescending,
		IconGrid,
		IconHashtag,
		IconHistory,
		IconInfinite,
		IconKeyboard,
		IconMap,
		IconMoon,
		IconSun,
		IconMessageCircle,
		IconNextFill,
		IconOptionsHorizontal,
		IconPalette,
		IconPause,
		IconPlayFill,
		IconPreviousFill,
		IconRadio,
		IconSearch,
		IconSettings,
		IconShare,
		IconShuffle,
		IconSidebarFillRight,
		IconSignal,
		IconSort,
		IconSparkles,
		IconTag,
		IconUnorderedList,
		IconUser,
		IconUsers,
		IconWifiOff,
		IconWifi
	} from 'obra-icons-svelte'

	/** @type {{icon: string, title?: string, className?: string, size?: string | number, children?: any, [key: string]: any}} */
	const {children, icon = '', title, className = '', size = 20, ...rest} = $props()

	const icons = {
		add: IconAdd,
		'arrow-down': IconArrowDown,
		'arrow-up': IconArrowUp,
		'chart-scatter': IconChartScatter,
		'circle-info': IconCircleInfo,
		'code-branch': IconCodeBranch,
		html: IconHtml,
		close: IconClose,
		code: IconCode,
		delete: IconDelete,
		'document-download': IconDocumentDownload,
		eject: IconEject,
		favorite: IconFavorite,
		'favorite-fill': IconFavoriteFill,
		'filter-alt': IconFilterAlt,
		fullscreen: IconFullscreen,
		'funnel-ascending': IconFunnelAscending,
		'funnel-descending': IconFunnelDescending,
		grid: IconGrid,
		hash: IconHashtag,
		history: IconHistory,
		infinite: IconInfinite,
		keyboard: IconKeyboard,
		map: IconMap,
		'message-circle': IconMessageCircle,
		'next-fill': IconNextFill,
		'options-horizontal': IconOptionsHorizontal,
		palette: IconPalette,
		pause: IconPause,
		'play-fill': IconPlayFill,
		'previous-fill': IconPreviousFill,
		radio: IconRadio,
		search: IconSearch,
		moon: IconMoon,
		sun: IconSun,
		settings: IconSettings,
		share: IconShare,
		shuffle: IconShuffle,
		'sidebar-fill-right': IconSidebarFillRight,
		signal: IconSignal,
		sort: IconSort,
		sparkles: IconSparkles,
		tag: IconTag,
		'unordered-list': IconUnorderedList,
		user: IconUser,
		users: IconUsers,
		'wifi-off': IconWifiOff,
		wifi: IconWifi
	}

	const Icon = $derived(icons[icon] ?? null)
</script>

<i class={`icon ${className}`} class:icon {title}>
	{#if Icon}
		<Icon {size} {...rest} />
	{/if}
	{#if children}
		{@render children()}
	{/if}
</i>

<style>
	.icon {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		font-style: normal;
	}
</style>
