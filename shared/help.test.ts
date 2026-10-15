import { describe, expect, it } from 'vitest'
import {
  createSlugger,
  extractHeadings,
  groupByCategory,
  highlightParts,
  parseArticle,
  queryTerms,
  searchArticles,
  slugify,
  toSections,
  type SearchableArticle,
} from './help'

const raw = `---
title: "Connections"
description: Save and test connections.
category: Getting started
order: 2
related: [data-grid, editing]
---

# Connections

Intro text with \`code\`.

## SSL {#ssl}

Encrypts the traffic.

\`\`\`bash
## not a heading
\`\`\`

## Add a connection

Click **New connection** and fill the host.

### Add a connection
`

describe('parseArticle', () => {
  it('reads the frontmatter and keeps the body', () => {
    const a = parseArticle('connections', raw)
    expect(a).toMatchObject({
      slug: 'connections',
      title: 'Connections',
      category: 'Getting started',
      order: 2,
      related: ['data-grid', 'editing'],
    })
    expect(a.body.startsWith('\n# Connections') || a.body.startsWith('# Connections')).toBe(true)
  })

  it('reports the missing field', () => {
    expect(() => parseArticle('x', '---\ntitle: A\n---\nbody')).toThrow(/description/)
    expect(() => parseArticle('x', 'no frontmatter')).toThrow(/frontmatter/)
    expect(() => parseArticle('x', '---\ntitle: A\ndescription: b\ncategory: c\norder: x\nrelated: []\n---\n')).toThrow(/order/)
  })
})

describe('headings', () => {
  it('slugifies and de-duplicates', () => {
    expect(slugify('Add a Connection!')).toBe('add-a-connection')
    expect(slugify('Conexão e túnel')).toBe('conexao-e-tunel')
    const slug = createSlugger()
    expect([slug('Same'), slug('Same'), slug('Same')]).toEqual(['same', 'same-1', 'same-2'])
  })

  it('lists h2/h3 with explicit ids, skipping code fences and the title', () => {
    expect(extractHeadings(parseArticle('c', raw).body)).toEqual([
      { id: 'ssl', text: 'SSL', level: 2 },
      { id: 'add-a-connection', text: 'Add a connection', level: 2 },
      { id: 'add-a-connection-1', text: 'Add a connection', level: 3 },
    ])
  })
})

describe('search', () => {
  const body = parseArticle('connections', raw).body
  const article: SearchableArticle = {
    ...parseArticle('connections', raw),
    headings: extractHeadings(body),
    sections: toSections(body),
  }
  const other: SearchableArticle = {
    slug: 'editing',
    title: 'Editing data',
    description: 'Change cells.',
    category: 'Data',
    order: 4,
    related: [],
    headings: [],
    sections: [{ heading: null, text: 'Pending changes are saved in one transaction.' }],
  }

  it('matches the title above headings above the body', () => {
    const hits = searchArticles([other, article], 'connection')
    expect(hits[0]!.slug).toBe('connections')
    expect(searchArticles([article], 'host')[0]!.heading).toEqual({ id: 'add-a-connection', text: 'Add a connection' })
  })

  it('requires every term and ignores case', () => {
    expect(searchArticles([article, other], 'NEW host')).toHaveLength(1)
    expect(searchArticles([article, other], 'transaction connection')).toHaveLength(0)
    expect(searchArticles([article], '   ')).toEqual([])
  })

  it('does not index code blocks as headings', () => {
    expect(article.sections.some((s) => s.heading?.text === 'not a heading')).toBe(false)
  })

  it('splits text for highlighting', () => {
    expect(highlightParts('Open the Tunnel', ['tunnel'])).toEqual([
      { text: 'Open the ', match: false },
      { text: 'Tunnel', match: true },
    ])
    expect(queryTerms('  ssh   tunnel ')).toEqual(['ssh', 'tunnel'])
    expect(queryTerms('a')).toEqual(['a'])
  })
})

describe('groupByCategory', () => {
  it('orders categories by their first article', () => {
    const groups = groupByCategory([
      { slug: 'b', title: 'B', description: '', category: 'Data', order: 3, related: [] },
      { slug: 'a', title: 'A', description: '', category: 'Start', order: 1, related: [] },
      { slug: 'c', title: 'C', description: '', category: 'Data', order: 2, related: [] },
    ])
    expect(groups.map((g) => g.category)).toEqual(['Start', 'Data'])
    expect(groups[1]!.articles.map((a) => a.slug)).toEqual(['c', 'b'])
  })
})
