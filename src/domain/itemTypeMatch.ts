/** Lowercase, accent-free, singularized word tokens ("Fones de Ouvido" -> ["fone", "de", "ouvido"]). */
function tokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return false
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true
  }
  return false
}

/**
 * The catalog entry whose full name appears inside `text`, ignoring case,
 * accents and plural "s" — "fones de ouvido intra-auricular samsung" matches
 * "Fone de ouvido". When several match, the one with more words wins.
 */
export function matchItemType<T extends { name: string }>(text: string, types: T[]): T | undefined {
  const words = tokens(text)
  let best: T | undefined
  let bestLength = 0
  for (const type of types) {
    const needle = tokens(type.name)
    if (needle.length > bestLength && containsSequence(words, needle)) {
      best = type
      bestLength = needle.length
    }
  }
  return best
}

/** Catalog entries whose name contains `text` (same normalization), for the suggestion list. */
export function filterItemTypes<T extends { name: string }>(text: string, types: T[]): T[] {
  const query = tokens(text).join(' ')
  if (!query) return types
  return types.filter((t) => tokens(t.name).join(' ').includes(query))
}
