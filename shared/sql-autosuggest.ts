/** Shortest typed statement (without surrounding blanks) that gets a suggestion. */
export const AUTOSUGGEST_MIN_PREFIX = 2

const blank = (c: string | undefined): boolean => c !== undefined && /\s/.test(c)

/**
 * Rest of `entry` after `prefix`, or null when `entry` does not start with it. Letters compare
 * case-insensitively and any run of whitespace matches any other run (`select  *` vs `select\n*`).
 */
export function completeFrom(prefix: string, entry: string): string | null {
  let i = 0
  let j = 0
  while (i < prefix.length) {
    if (blank(prefix[i])) {
      if (!blank(entry[j])) return null
      while (blank(prefix[i])) i++
      while (blank(entry[j])) j++
      continue
    }
    if (j >= entry.length || prefix[i]!.toLowerCase() !== entry[j]!.toLowerCase()) return null
    i++
    j++
  }
  const rest = entry.slice(j)
  return rest.trim() ? rest : null
}

/**
 * zsh-autosuggestions for SQL: the rest of the newest entry that starts with the statement typed
 * so far (`prefix`, from the statement start to the cursor). `entries` are newest first.
 */
export function autosuggest(prefix: string, entries: readonly string[]): string | null {
  const typed = prefix.trimStart()
  if (typed.trim().length < AUTOSUGGEST_MIN_PREFIX) return null
  for (const entry of entries) {
    const rest = completeFrom(typed, entry.trim())
    if (rest) return rest
  }
  return null
}
