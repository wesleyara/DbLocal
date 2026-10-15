import { describe, expect, it } from 'vitest'
import { formatShortcut, isTypingTarget, matchesShortcut, parseShortcut } from './shortcuts'

const ev = (key: string, mods: Partial<{ meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }> = {}) => ({
  key,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
})

describe('matchesShortcut', () => {
  it('treats mod as ⌘ or Ctrl', () => {
    expect(matchesShortcut(ev('k', { meta: true }), 'mod+k')).toBe(true)
    expect(matchesShortcut(ev('K', { ctrl: true }), 'mod+k')).toBe(true)
    expect(matchesShortcut(ev('k'), 'mod+k')).toBe(false)
  })
  it('requires shift and alt to match exactly for letters', () => {
    expect(matchesShortcut(ev('f', { ctrl: true, shift: true }), 'mod+shift+f')).toBe(true)
    expect(matchesShortcut(ev('f', { ctrl: true }), 'mod+shift+f')).toBe(false)
    expect(matchesShortcut(ev('f', { ctrl: true, shift: true }), 'mod+f')).toBe(false)
    expect(matchesShortcut(ev('f', { ctrl: true, alt: true }), 'mod+f')).toBe(false)
  })
  it('matches shifted symbols', () => {
    expect(matchesShortcut(ev('?', { shift: true }), '?')).toBe(true)
    expect(matchesShortcut(ev('?'), '?')).toBe(true)
    expect(matchesShortcut(ev('{', { ctrl: true, shift: true }), 'mod+shift+[')).toBe(true)
    expect(matchesShortcut(ev('[', { ctrl: true }), 'mod+[')).toBe(true)
    expect(matchesShortcut(ev('[', { ctrl: true, shift: true }), 'mod+[')).toBe(false)
  })
  it('matches named keys', () => {
    expect(matchesShortcut(ev('Home'), 'home')).toBe(true)
    expect(matchesShortcut(ev('F1'), 'f1')).toBe(true)
    expect(matchesShortcut(ev('Enter', { meta: true }), 'mod+enter')).toBe(true)
  })
})

describe('formatShortcut', () => {
  it('uses symbols on macOS and words elsewhere', () => {
    expect(formatShortcut('mod+shift+[', true)).toEqual(['⌘', '⇧', '['])
    expect(formatShortcut('mod+shift+[', false)).toEqual(['Ctrl', 'Shift', '['])
    expect(formatShortcut('mod+k', false)).toEqual(['Ctrl', 'K'])
    expect(formatShortcut('?', false)).toEqual(['?'])
    expect(formatShortcut('pagedown', false)).toEqual(['PgDn'])
    expect(formatShortcut('f1', false)).toEqual(['F1'])
  })
  it('parses the plus key', () => {
    expect(parseShortcut('mod++')).toMatchObject({ mod: true, key: '+' })
  })
})

describe('isTypingTarget', () => {
  it('knows fields and the editor', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as never)).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as never)).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', closest: () => ({}) } as never)).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', closest: () => null } as never)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
