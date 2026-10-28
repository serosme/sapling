export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  nitro: {
    preset: 'cloudflare_module',

    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
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
