/**
 * Lowercases and strips all non-alphanumeric characters from a name.
 *
 * @example
 * ```ts
 * simplify("Effect-TS")       // "effectts"
 * simplify("duckdb_mooncake") // "duckdbmooncake"
 * simplify("effect")          // "effect"
 * ```
 */
export function simplify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}
