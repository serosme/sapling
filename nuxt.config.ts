export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxthub/core'],

  nitro: {
    preset: 'cloudflare_module',
  },

  hub: {
    db: 'sqlite',
  },

  runtimeConfig: {
    apiToken: '',
    ai: {
      baseURL: '',
      apiKey: '',
      model: '',
    },
  },
})
