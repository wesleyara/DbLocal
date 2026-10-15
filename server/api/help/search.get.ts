import { searchArticles } from '#shared/help'
import { useHelpLibrary } from '../../help/library'

/** `GET /api/help/search?q=&locale=` -> hits ranked by title, headings, description, body. */
export default defineEventHandler(async (event) => {
  const { q, locale } = getQuery(event)
  const library = await useHelpLibrary()
  const term = typeof q === 'string' ? q.slice(0, 200) : ''
  return searchArticles(library.index(typeof locale === 'string' ? locale : 'en'), term).slice(0, 30)
})
