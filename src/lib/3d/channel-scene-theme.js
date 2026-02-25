function getCssColor(variable) {
	if (typeof document === 'undefined') return '#ff0000'
	const div = document.createElement('div')
	div.style.color = `var(${variable})`
	div.style.visibility = 'hidden'
	div.style.position = 'absolute'
	document.body.appendChild(div)
	const color = getComputedStyle(div).color
	document.body.removeChild(div)
	return color
}

function getMediaRadiusPx() {
	if (typeof document === 'undefined') return 0
	const div = document.createElement('div')
	div.style.borderRadius = 'var(--media-radius)'
	div.style.visibility = 'hidden'
	div.style.position = 'absolute'
	document.body.appendChild(div)
	const px = parseFloat(getComputedStyle(div).borderTopLeftRadius || '0')
	document.body.removeChild(div)
	return Number.isFinite(px) ? px : 0
}

export function getChannelSceneThemeConfig() {
	const hoverBorderColor = getCssColor('--gray-5')
	const mediaRadiusPx = getMediaRadiusPx()
	const roundArtworks = mediaRadiusPx > 0.01
	return {
		liveBorderColor: getCssColor('--accent-9'),
		hoverBorderColor,
		activeBorderColor: hoverBorderColor,
		favoriteBorderColor: getCssColor('--accent-8'),
		selectedBorderColor: getCssColor('--accent-7'),
		defaultCardColor: getCssColor('--gray-1'),
		selectedCardColor: getCssColor('--gray-2'),
		favoriteCardColor: getCssColor('--accent-2'),
		playingCardColor: getCssColor('--accent-3'),
		activeCardColor: getCssColor('--accent-4'),
		liveCardColor: getCssColor('--accent-2'),
		infoBgColor: getCssColor('--gray-1'),
		infoTextColor: getCssColor('--gray-12'),
		infoMutedColor: getCssColor('--gray-10'),
		tagBgColor: getCssColor('--accent-4'),
		tagTextColor: getCssColor('--accent-11'),
		tagHoverBgColor: getCssColor('--accent-5'),
		tagHoverBorderColor: getCssColor('--gray-6'),
		tagActiveBgColor: getCssColor('--accent-9'),
		tagActiveTextColor: getCssColor('--gray-1'),
		tagActiveBorderColor: getCssColor('--accent-9'),
		infoBorderColor: getCssColor('--gray-5'),
		activeInfoTextColor: getCssColor('--gray-1'),
		activeInfoMutedColor: getCssColor('--gray-2'),
		liveBadgeBgColor: getCssColor('--accent-9'),
		liveBadgeTextColor: getCssColor('--gray-1'),
		liveSphereColor: getCssColor('--accent-9'),
		liveSphereSpecColor: getCssColor('--gray-1'),
		liveSphereEmissiveStrength: 0.28,
		liveSpherePulseAmount: 0.045,
		liveSpherePulseSpeed: 1.8,
		liveSphereSizeRatio: 0.14,
		tagBadgeColor: getCssColor('--accent-9'),
		roundArtworks,
		cornerRadius: roundArtworks ? 0.12 : 0
	}
}
