/**
 * Days Radio4000 stands down in solidarity with a movement. Each date is a
 * local calendar day (YYYY-MM-DD): the whole app is replaced by the
 * solidarity message from local midnight to local midnight.
 */
export const SOLIDARITY_DAYS = ['2026-11-05']

/** True when `date`, read in local time, falls on a solidarity day. */
export function isSolidarityDay(date = new Date()) {
	const day = [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-')
	return SOLIDARITY_DAYS.includes(day)
}
