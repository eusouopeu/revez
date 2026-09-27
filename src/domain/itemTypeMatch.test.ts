import { describe, expect, it } from 'vitest'
import { filterItemTypes, matchItemType } from './itemTypeMatch'

const TYPES = [
  { name: 'Fone de ouvido' },
  { name: 'Tênis' },
  { name: 'Óculos' },
  { name: 'Roupa de cama' },
  { name: 'Meias' },
]

describe('matchItemType', () => {
  it('matches a full term inside a longer name, ignoring case, accents and plural', () => {
    expect(matchItemType('fones de ouvido intra-auricular samsung', TYPES)?.name).toBe('Fone de ouvido')
    expect(matchItemType('Tenis Nike de corrida', TYPES)?.name).toBe('Tênis')
    expect(matchItemType('oculos de grau', TYPES)?.name).toBe('Óculos')
    expect(matchItemType('roupas de cama casal', TYPES)?.name).toBe('Roupa de cama')
  })

  it('requires the whole term, not a fragment of it', () => {
    expect(matchItemType('fone bluetooth', TYPES)).toBeUndefined()
    expect(matchItemType('cama box', TYPES)).toBeUndefined()
    expect(matchItemType('', TYPES)).toBeUndefined()
  })

  it('prefers the longest matching term', () => {
    const types = [{ name: 'Roupa' }, { name: 'Roupa de cama' }]
    expect(matchItemType('roupa de cama nova', types)?.name).toBe('Roupa de cama')
  })
})

describe('filterItemTypes', () => {
  it('returns everything for an empty query and narrows as the user types', () => {
    expect(filterItemTypes('', TYPES)).toHaveLength(TYPES.length)
    expect(filterItemTypes('ouv', TYPES).map((t) => t.name)).toEqual(['Fone de ouvido'])
    expect(filterItemTypes('teni', TYPES).map((t) => t.name)).toEqual(['Tênis'])
    expect(filterItemTypes('zzz', TYPES)).toEqual([])
  })
})
