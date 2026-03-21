/** Format seconds to "m:ss" (e.g. 185 → "3:05")
 * @param {number | null | undefined} seconds */
export function formatDuration(seconds) {
	if (!seconds) return ''
	const mins = Math.floor(seconds / 60)
	const secs = seconds % 60
	return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** Format milliseconds to "m:ss"
 * @param {number | null | undefined} ms */
export function formatDurationMs(ms) {
	if (!ms) return ''
	return formatDuration(Math.floor(ms / 1000))
}

/** Format milliseconds as a compact duration string: "42s", "1m30s", "3m"
 * @param {number | null | undefined} ms */
export function formatDurationCompact(ms) {
	if (!ms) return ''
	const s = Math.round(ms / 1000)
	if (s < 60) return `${s}s`
	const m = Math.floor(s / 60)
	const rem = s % 60
	return rem ? `${m}m${rem}s` : `${m}m`
}

/** @param {Date | string | number | null | undefined} date */
function toValidDate(date) {
	if (date == null) return null
	const value = date instanceof Date ? date : new Date(date)
	if (!Number.isFinite(value.getTime())) return null
	return value
}

/** @param {Date | string | number | null | undefined} date */
export function formatDate(date, locale = undefined) {
	const value = toValidDate(date)
	if (!value) return ''
	return new Intl.DateTimeFormat(locale).format(value)
}

/** Format just the time portion (HH:MM:SS), localized.
 * @param {Date | string | number | null | undefined} date
 * @param {string | string[] | undefined} [locale] */
export function formatTime(date, locale = undefined) {
	const value = toValidDate(date)
	if (!value) return ''
	return new Intl.DateTimeFormat(locale, {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	}).format(value)
}

/** Label for a calendar day: "today", "yesterday", or a short locale date.
 * Uses Intl so "today"/"yesterday" are translated automatically.
 * @param {Date | string | number | null | undefined} date
 * @param {string | string[] | undefined} [locale] */
export function dayLabel(date, locale = undefined) {
	const value = toValidDate(date)
	if (!value) return ''
	const today = new Date()
	const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
	const startOfValue = new Date(value.getFullYear(), value.getMonth(), value.getDate())
	const diffDays = Math.round((startOfToday.getTime() - startOfValue.getTime()) / 86400000)
	if (diffDays === 0 || diffDays === 1) {
		return new Intl.RelativeTimeFormat(locale, {numeric: 'auto'}).format(-diffDays, 'day')
	}
	const isThisYear = value.getFullYear() === today.getFullYear()
	return new Intl.DateTimeFormat(locale, {
		month: 'short',
		day: 'numeric',
		...(isThisYear ? {} : {year: 'numeric'})
	}).format(value)
}

/** Formal date-time: "Year/Month/day time", localized numerals/time by locale
 * @param {Date | string | number | null | undefined} date
 * @param {string | string[] | undefined} [locale] */
export function formatDateFormal(date, locale = undefined) {
	const value = toValidDate(date)
	if (!value) return ''
	const parts = new Intl.DateTimeFormat(locale, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(value)
	const year = parts.find((part) => part.type === 'year')?.value
	const month = parts.find((part) => part.type === 'month')?.value
	const day = parts.find((part) => part.type === 'day')?.value
	if (!year || !month || !day) return ''
	const time = new Intl.DateTimeFormat(locale, {
		hour: '2-digit',
		minute: '2-digit'
	}).format(value)
	return `${year}/${month}/${day} ${time}`
}

/** @param {Date | string | number | null | undefined} date */
export function toIsoDateTime(date) {
	const value = toValidDate(date)
	if (!value) return ''
	return value.toISOString()
}

/** @param {Date | string | number | null | undefined} date */
export function isValidDateInput(date) {
	return Boolean(toValidDate(date))
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
	if (days === 0) return 'today'
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
	const daysString =
		remainingDays === 0 ? '' : `${remainingDays} earth rotation${remainingDays > 1 ? 's' : ''}`
	return `${yearsString}${andString}${daysString}` || 'today'
}

/** More detailed relative date with months/years
 * @param {string} dateString */
export function relativeDateDetailed(dateString) {
	if (!dateString) return ''
	const date = new Date(dateString)
	const now = new Date()
	const diffMs = now.getTime() - date.getTime()
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

	if (diffDays === 0) return 'today'
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

/** Value-neutral: just the year - archives aren't stale
 * @param {string | null | undefined} dateString */
export function dateYear(dateString) {
	if (!dateString) return ''
	return new Date(dateString).getFullYear().toString()
}

/** Smart date: recent shows relative time, older shows just year
 * @param {string | null | undefined} dateString */
export function dateProvenance(dateString) {
	if (!dateString) return ''
	const days = differenceInDays(dateString)
	if (days < 7) return 'this week'
	if (days < 30) return 'this month'
	if (days < 90) return 'recent'
	return dateYear(dateString)
}

// ---------------------------------------------------------------------------
// Period generation — for splitting date ranges into year/quarter/month buckets
// ---------------------------------------------------------------------------

/** @typedef {{label: string, startDate: Date, endDate: Date}} TimePeriod */

/** Get min/max dates from items with a date field.
 * @param {{created_at: string}[]} items
 * @returns {{minDate: Date, maxDate: Date} | null} */
export function getDateRange(items) {
	if (!items.length) return null
	const dates = items.map((t) => new Date(t.created_at).getTime())
	return {
		minDate: new Date(Math.min(...dates)),
		maxDate: new Date(Math.max(...dates))
	}
}

/** Generate year periods between two dates.
 * @param {Date} start
 * @param {Date} end
 * @returns {TimePeriod[]} */
export function generateYearPeriods(start, end) {
	const periods = []
	for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
		periods.push({
			label: year.toString(),
			startDate: new Date(year, 0, 1),
			endDate: new Date(year + 1, 0, 1)
		})
	}
	return periods
}

/** Generate quarter (solstice) periods between two dates.
 * @param {Date} start
 * @param {Date} end
 * @param {string[]} quarterNames — four labels, one per quarter (e.g. translated solstice names)
 * @returns {TimePeriod[]} */
export function generateQuarterPeriods(start, end, quarterNames) {
	const periods = []
	for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
		for (let q = 0; q < 4; q++) {
			const quarterStart = new Date(year, q * 3, 1)
			const quarterEnd = new Date(year, (q + 1) * 3, 1)
			if (quarterStart <= end && quarterEnd >= start) {
				periods.push({
					label: `${year} ${quarterNames[q]}`,
					startDate: quarterStart,
					endDate: quarterEnd
				})
			}
		}
	}
	return periods
}

/** Generate month periods between two dates.
 * @param {Date} start
 * @param {Date} end
 * @returns {TimePeriod[]} */
export function generateMonthPeriods(start, end) {
	const periods = []
	let currentYear = start.getFullYear()
	let currentMonth = start.getMonth()
	const endYear = end.getFullYear()
	const endMonth = end.getMonth()

	while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
		const monthStart = new Date(currentYear, currentMonth, 1)
		const monthEnd = new Date(currentYear, currentMonth + 1, 1)
		periods.push({
			label: `${currentYear} ${monthStart.toLocaleDateString('en', {month: 'short'})}`,
			startDate: monthStart,
			endDate: monthEnd
		})
		currentMonth++
		if (currentMonth > 11) {
			currentMonth = 0
			currentYear++
		}
	}
	return periods
}

/** Filter items by a date-range period.
 * @param {{created_at: string}[]} items
 * @param {TimePeriod} period
 * @returns {{created_at: string}[]} */
export function filterByDateRange(items, period) {
	return items.filter((item) => {
		const date = new Date(item.created_at)
		return date >= period.startDate && date < period.endDate
	})
}
