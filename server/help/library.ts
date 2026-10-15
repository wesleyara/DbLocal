import { createHelpLibrary, type HelpFiles, type HelpLibrary } from './articles'

let library: HelpLibrary | null = null

/** The articles bundled into the server (`nitro.serverAssets`, `content/help`). Read once. */
export async function useHelpLibrary(): Promise<HelpLibrary> {
  if (library) return library
  const storage = useStorage('assets:help')
  const files: HelpFiles = {}
  for (const key of await storage.getKeys()) {
    if (!key.endsWith('.md')) continue
    const value = await storage.getItem<string>(key)
    if (typeof value === 'string') files[key] = value
  }
  library = createHelpLibrary(files)
  return library
}
