import { useHelpLibrary } from '../../help/library'

/** `GET /api/help?locale=` -> metadata of every article, in the requested locale (English fallback). */
export default defineEventHandler(async (event) => {
  const { locale } = getQuery(event)
  const library = await useHelpLibrary()
  return library.list(typeof locale === 'string' ? locale : 'en')
})
