import { handleApi } from './api.mjs'

export function localApiPlugin() {
  return {
    name: 'local-ai-news-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (!await handleApi(req, res)) next()
        } catch (error) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: error.message }))
        }
      })
    }
  }
}
