/**
 * Generic per-tab UI state store, keyed by `(sessionId, tabId, field)`.
 *
 * Lets tab renderers persist controls (filters, toggles, expansions) so they
 * survive the re-render that happens when switching between file tabs.
 */

const states = new Map<string, unknown>();

function key(sessionId: string, tabId: string, field: string): string {
	return `${sessionId}:${tabId}:${field}`;
}

/** Read a persisted value for a tab control, or undefined if never set. */
export function getTabState<T>(sessionId: string, tabId: string, field: string): T | undefined {
	return states.get(key(sessionId, tabId, field)) as T | undefined;
}

/** Persist a tab control value. */
export function setTabState(sessionId: string, tabId: string, field: string, value: unknown): void {
	states.set(key(sessionId, tabId, field), value);
}

/** Drop all persisted state for a session (call when closing a file tab). */
export function clearTabStatesForSession(sessionId: string): void {
	const prefix = `${sessionId}:`;
	for (const k of states.keys()) {
		if (k.startsWith(prefix)) states.delete(k);
	}
}
