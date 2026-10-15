import { useHelpLibrary } from '../../help/library'

/** `GET /api/help/:slug?locale=` -> the rendered article, or 404. */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const { locale } = getQuery(event)
  const library = await useHelpLibrary()
  const article = library.get(typeof locale === 'string' ? locale : 'en', slug)
  if (!article) throw createError({ statusCode: 404, statusMessage: 'Article not found' })
  return article
})
