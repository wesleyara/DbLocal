import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxt/eslint', '@nuxt/fonts', '@nuxt/icon', '@pinia/nuxt', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  typescript: { strict: true },
  devServer: {
    host: process.env.DBLOCAL_HOST || '127.0.0.1',
    port: Number(process.env.DBLOCAL_PORT) || 5555,
  },
  fonts: {
    families: [
      { name: 'Inter', provider: 'google', weights: ['400 700'], styles: ['normal'] },
      { name: 'JetBrains Mono', provider: 'google', weights: ['400 700'], styles: ['normal'] },
    ],
  },
  icon: { serverBundle: 'local', clientBundle: { scan: true } },
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    langDir: 'locales',
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'pt-BR', language: 'pt-BR', name: 'Português', file: 'pt-BR.json' },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'dblocal_locale',
      redirectOn: 'root',
      fallbackLocale: 'en',
    },
  },
  app: {
    head: {
      script: [
        {
          // Applies the stored theme before first paint to avoid a flash.
          innerHTML: `try{var t=JSON.parse(localStorage.getItem('dblocal-ui')||'{}').theme||'system';var d=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.dataset.theme=d}catch(e){}`,
        },
      ],
    },
  },
})
