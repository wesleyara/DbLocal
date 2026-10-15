export function bumpVersion(version: string, kind: string): string
export function unreleasedBody(changelog: string): string
export function changelogFromCommits(subjects: string[]): string
export function rollChangelog(changelog: string, version: string, date: string, generated?: string): string
export function changelogNotes(changelog: string, version: string): string | null
