<script>
	import {
		IconAdd,
		IconArrowDown,
		IconArrowUp,
		IconBox3d,
		IconCellSignal,
		IconHtml,
		IconCodeBranch,
		IconChartScatter,
		IconCircleInfo,
		IconClose,
		IconCode,
		IconDatabase,
		IconDelete,
		IconDocument,
		IconDocumentDownload,
		IconEject,
		IconEye,
		IconEyeClose,
		IconFavorite,
		IconFavoriteFill,
		IconFilterAlt,
		IconFolder,
		IconFullscreen,
		IconFunnelAscending,
		IconFunnelDescending,
		IconGlobe,
		IconGrid,
		IconHandPointer,
		IconHashtag,
		IconHistory,
		IconInfinite,
		IconKeyboard,
		IconMap,
		IconMoon,
		IconMouse,
		IconSun,
		IconMessageCircle,
		IconNextFill,
		IconMenu,
		IconOptionsHorizontal,
		IconOptionsVerticalEncircled,
		IconPalette,
		IconPause,
		IconPin,
		IconPlayFill,
		IconPreviousFill,
		IconRadio,
		IconRadioOn,
		IconRotate,
		IconSearch,
		IconSettings,
		IconSwitchAlt,
		IconShare,
		IconShuffle,
		IconSidebarFillRight,
		IconSignal,
		IconSort,
		IconSparkles,
		IconTag,
		IconTv,
		IconUnorderedList,
		IconUser,
		IconUsers,
		IconWifiOff,
		IconWifi
	} from 'obra-icons-svelte'
	import IconDeckPanel from '$lib/components/icon-deck-panel.svelte'

	/** @type {{icon: string, title?: string, className?: string, size?: string | number, children?: any, [key: string]: any}} */
	const {children, icon = '', title, className = '', size = 18, ...rest} = $props()

	const icons = {
		add: IconAdd,
		'arrow-down': IconArrowDown,
		'arrow-up': IconArrowUp,
		'box-3d': IconBox3d,
		'chart-scatter': IconChartScatter,
		'circle-info': IconCircleInfo,
		'code-branch': IconCodeBranch,
		html: IconHtml,
		close: IconClose,
		code: IconCode,
		database: IconDatabase,
		delete: IconDelete,
		document: IconDocument,
		'document-download': IconDocumentDownload,
		eject: IconEject,
		eye: IconEye,
		'eye-close': IconEyeClose,
		favorite: IconFavorite,
		'favorite-fill': IconFavoriteFill,
		'filter-alt': IconFilterAlt,
		folder: IconFolder,
		fullscreen: IconFullscreen,
		'funnel-ascending': IconFunnelAscending,
		'funnel-descending': IconFunnelDescending,
		globe: IconGlobe,
		grid: IconGrid,
		'hand-pointer': IconHandPointer,
		hash: IconHashtag,
		history: IconHistory,
		infinite: IconInfinite,
		keyboard: IconKeyboard,
		map: IconMap,
		mouse: IconMouse,
		'message-circle': IconMessageCircle,
		'next-fill': IconNextFill,
		menu: IconMenu,
		'options-horizontal': IconOptionsHorizontal,
		'options-vertical-encircled': IconOptionsVerticalEncircled,
		palette: IconPalette,
		pause: IconPause,
		pin: IconPin,
		'play-fill': IconPlayFill,
		'previous-fill': IconPreviousFill,
		'cell-signal': IconCellSignal,
		radio: IconRadio,
		'radio-on': IconRadioOn,
		rotate: IconRotate,
		search: IconSearch,
		'switch-alt': IconSwitchAlt,
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
		tv: IconTv,
		'unordered-list': IconUnorderedList,
		user: IconUser,
		users: IconUsers,
		'wifi-off': IconWifiOff,
		wifi: IconWifi,
		'deck-panel': IconDeckPanel
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
