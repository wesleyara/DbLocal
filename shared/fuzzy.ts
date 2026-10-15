/**
 * Subsequence fuzzy match for the command palette. Returns a score (higher is better) or null when
 * the characters of `query` do not appear in order in `text`. Matches at the start, after a word
 * boundary (`_ - . space /`) and in a row score higher; shorter targets win ties.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase()
  if (q === '') return 0
  const t = text.toLowerCase()
  if (t === q) return 1000
  if (t.startsWith(q)) return 800 - t.length
  const at = t.indexOf(q)
  if (at !== -1) return 500 - at - t.length / 100

  let score = 0
  let from = 0
  let streak = 0
  for (const ch of q) {
    const found = t.indexOf(ch, from)
    if (found === -1) return null
    const boundary = found === 0 || /[\s_\-./]/.test(t[found - 1]!)
    streak = found === from ? streak + 1 : 0
    score += 1 + (boundary ? 4 : 0) + streak * 2 - Math.min(found - from, 6) * 0.2
    from = found + 1
  }
  return score - t.length / 100
}

/** Items that match, best first. `text` picks the string compared; equal scores keep their order. */
export function fuzzyFilter<T>(query: string, items: T[], text: (item: T) => string): T[] {
  if (query.trim() === '') return items
  const scored: { item: T; score: number; index: number }[] = []
  items.forEach((item, index) => {
    const score = fuzzyScore(query, text(item))
    if (score !== null) scored.push({ item, score, index })
  })
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.map((s) => s.item)
}

export type PaletteInput =
  | { mode: 'all'; term: string }
  | { mode: 'actions'; term: string }
  | { mode: 'record'; table: string; pk: string }

/**
 * `>` filters the actions only; `#users 42` goes to the record 42 of `users` (`#users` alone is
 * still typing the table). Anything else is a plain search over every group.
 */
export function parsePaletteInput(text: string): PaletteInput {
  if (text.startsWith('>')) return { mode: 'actions', term: text.slice(1).trim() }
  if (text.startsWith('#')) {
    const rest = text.slice(1).trim()
    const space = rest.search(/\s/)
    if (space === -1) return { mode: 'record', table: rest, pk: '' }
    return { mode: 'record', table: rest.slice(0, space), pk: rest.slice(space).trim() }
  }
  return { mode: 'all', term: text.trim() }
}
