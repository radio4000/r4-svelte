import adze, {Formatter, setup} from 'adze'

const key = 'r5'

class R5Formatter extends Formatter {
	/**
	 * @param {import('adze').ModifierData} data
	 * @param {string} _timestamp
	 * @param {unknown[]} args
	 */
	formatBrowser(data, _timestamp, args) {
		if (!data.namespace) return [key, ...args]
		return [`${key}.${data.namespace?.[0]}`, ...args]
	}

	/**
	 * @param {import('adze').ModifierData} data
	 * @param {string} _timestamp
	 * @param {unknown[]} args
	 */
	formatServer(data, _timestamp, args) {
		if (!data.namespace) return [key, ...args]
		return [`${key}.${data.namespace?.[0]}`, ...args]
	}
}

/** Access logs via store.logs */
export const store = setup({
	cache: true,
	// Debug in dev; warnings and errors in production. Printing every debug line cost
	// 25-40ms per play or navigation, and the console keeps each logged object alive.
	activeLevel: import.meta.env.DEV ? 7 : 2, // 7 is debug, 2 is warn
	format: 'r5',
	formatters: {
		r5: R5Formatter
	}
})

/**
 * Usage
 * logger.info('greetings')
 * logger.warn('oh no')
 * logger.error('nop')
 *
 * Namespaced usage:
 * const slog = logger.ns('sync').seal()
 * slog.log('start') --> info #sync start
 */
export const logger = adze.seal()
