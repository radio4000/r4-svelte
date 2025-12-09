/** @param {Date} date */
export function formatDate(date) {
	return new Intl.DateTimeFormat('en-DE').format(date)
}

/** @param {string | null | undefined} dateString */
function differenceInDays(dateString) {
	if (!dateString) return 0
	const date = new Date(dateString).getTime()
	const today = Date.now()
	const diffTime = Math.abs(today - date)
	return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

/** @param {string | null | undefined} dateString */
export function relativeDate(dateString) {
	if (!dateString) return 'unknown'
	const days = differenceInDays(dateString)
	return `${days} day${days > 1 ? 's' : ''} ago`
}

/** Returns a fancy cosmic time duration string
 * @param {string | null | undefined} dateString */
export function relativeDateSolar(dateString) {
	if (!dateString) return 'unknown'
	const days = differenceInDays(dateString)
	const years = Math.floor(days / 365)
	const remainingDays = days % 365
	const yearsString = years ? `${years} sun orbit${years > 1 ? 's' : ''}` : ''
	const andString = years && remainingDays ? ', ' : ''
	const daysString = `${remainingDays} earth rotation${remainingDays > 1 ? 's' : ''}`
	return `${yearsString}${andString}${daysString}`
}

/** More detailed relative date with months/years
 * @param {string} dateString */
export function relativeDateDetailed(dateString) {
	if (!dateString) return ''
	const date = new Date(dateString)
	const now = new Date()
	const diffMs = now.getTime() - date.getTime()
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

	if (diffDays < 30) return `${diffDays} days ago`
	if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
	return `${Math.floor(diffDays / 365)} years ago`
}

/** Relative time for recent events, absolute date+time for older
 * @param {string | Date} dateInput */
export function relativeTime(dateInput) {
	if (!dateInput) return ''
	const date = new Date(dateInput)
	const diffMs = Date.now() - date.getTime()
	const diffMins = Math.floor(diffMs / 60000)

	// Recent: relative time
	if (diffMins < 60) return `${Math.max(1, diffMins)}m ago`
	if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`

	// Older: date + time
	const isThisYear = date.getFullYear() === new Date().getFullYear()
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		...(isThisYear ? {} : {year: 'numeric'}),
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	})
}
