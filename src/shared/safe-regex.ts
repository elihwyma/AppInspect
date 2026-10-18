/**
 * Conservative ReDoS guards for user-supplied regular expressions.
 *
 * JavaScript regex execution cannot be interrupted, so the only cheap defence
 * is to reject the classic catastrophic-backtracking shapes *before* compiling
 * them. These heuristics never reject ordinary search text (identifiers, class
 * names, paths, plain substrings).
 */

/** largest pattern we will compile; far beyond any realistic query */
export const MAX_REGEX_LENGTH = 512;

// (x+)+, (x*)*, (x+)*, (x*)+ and similar: a quantified group that is itself
// quantified. The alternation `[^()\\]|\\.` is unambiguous, so this pattern is
// itself linear.
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[*+][^()]*\)\s*[*+{]/;

// (a|a)+ — identical alternation branches.
const IDENTICAL_ALTERNATION = /\(([^()|]+)\|\1\)/;

/**
 * True when a user-supplied regex pattern is too long or matches a known
 * catastrophic-backtracking shape. Callers should treat a true result as "no
 * matches" (or a friendly "pattern too complex" error) rather than compiling
 * it.
 */
export function isPotentiallyUnsafeRegex(pattern: string): boolean {
	if (pattern.length > MAX_REGEX_LENGTH) return true;
	return NESTED_QUANTIFIER.test(pattern) || IDENTICAL_ALTERNATION.test(pattern);
}

/**
 * Compile a user-supplied pattern, returning null when it is unsafe or
 * invalid. Callers should treat null as "no matches" (or surface a friendly
 * message) instead of falling back to an unbounded regex.
 */
export function compileSafeRegex(pattern: string, flags?: string): RegExp | null {
	if (isPotentiallyUnsafeRegex(pattern)) return null;
	try {
		return new RegExp(pattern, flags);
	} catch {
		return null;
	}
}
