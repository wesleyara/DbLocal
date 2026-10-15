import { describe, expect, it } from 'vitest'
import { bumpVersion, changelogFromCommits, changelogNotes, rollChangelog, unreleasedBody } from '../../scripts/release-lib.mjs'

const CHANGELOG = `# Changelog

## [Unreleased]

### Added
- Something new.

## [0.1.0] - 2026-01-01

First version.
`

describe('bumpVersion', () => {
  it('bumps each part and resets the lower ones', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4')
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0')
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0')
  })

  it('rejects unknown kinds and non plain versions', () => {
    expect(() => bumpVersion('1.2.3', 'huge')).toThrow()
    expect(() => bumpVersion('1.2.3-beta.1', 'patch')).toThrow()
  })
})

describe('changelog', () => {
  it('reads the unreleased body', () => {
    expect(unreleasedBody(CHANGELOG)).toBe('### Added\n- Something new.')
  })

  it('rolls Unreleased under the new version and keeps an empty Unreleased', () => {
    const rolled = rollChangelog(CHANGELOG, '0.2.0', '2026-02-02')
    expect(rolled).toContain('## [Unreleased]\n\n## [0.2.0] - 2026-02-02\n\n### Added\n- Something new.')
    expect(unreleasedBody(rolled)).toBe('')
    expect(rolled).toContain('## [0.1.0] - 2026-01-01')
  })

  it('refuses to release when there is nothing at all', () => {
    const empty = rollChangelog(CHANGELOG, '0.2.0', '2026-02-02')
    expect(() => rollChangelog(empty, '0.2.1', '2026-02-03')).toThrow(/Nothing/)
    expect(() => rollChangelog(empty, '0.2.1', '2026-02-03', '')).toThrow(/Nothing/)
  })

  it('merges generated entries with the manual ones', () => {
    const rolled = rollChangelog(CHANGELOG, '0.2.0', '2026-02-02', '### Fixed\n- **auth:** x')
    expect(changelogNotes(rolled, '0.2.0')).toBe('### Added\n- Something new.\n\n### Fixed\n- **auth:** x')
    const onlyGenerated = rollChangelog(rolled, '0.2.1', '2026-02-03', '### Added\n- y')
    expect(changelogNotes(onlyGenerated, '0.2.1')).toBe('### Added\n- y')
    expect(onlyGenerated).toContain('## [0.2.0] - 2026-02-02')
  })

  it('extracts the notes of one version only', () => {
    expect(changelogNotes(CHANGELOG, '0.1.0')).toBe('First version.')
    expect(changelogNotes(rollChangelog(CHANGELOG, '0.2.0', '2026-02-02'), '0.2.0')).toBe('### Added\n- Something new.')
    expect(changelogNotes(CHANGELOG, '9.9.9')).toBeNull()
  })
})

describe('changelogFromCommits', () => {
  it('groups Conventional Commits and skips housekeeping', () => {
    const out = changelogFromCommits([
      'feat(grid): query history dialog',
      'fix(auth): serve locale messages on the login page',
      'fix(auth): serve locale messages on the login page',
      'refactor: split the driver',
      'perf(query): stream exports',
      'docs: update the readme',
      'test(e2e): add dialect suite',
      'chore(release): v0.2.0',
      'feat(api)!: rename the rows endpoint',
      'not a conventional commit',
    ])
    expect(out).toBe(
      [
        '### Breaking changes\n- **api:** rename the rows endpoint',
        '### Added\n- **grid:** query history dialog',
        '### Fixed\n- **auth:** serve locale messages on the login page',
        '### Performance\n- **query:** stream exports',
        '### Changed\n- split the driver',
      ].join('\n\n'),
    )
  })

  it('returns an empty string when nothing is user facing', () => {
    expect(changelogFromCommits(['docs: x', 'ci: y', 'chore(release): v1.0.0'])).toBe('')
  })
})
