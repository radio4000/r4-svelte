// Ideally SDK errors would have consistent shape. They don't.
export function getErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message
	if (typeof err === 'string') return err
	if (err && typeof err === 'object' && 'message' in err) return String(err.message)
	return 'Unknown error'
}
