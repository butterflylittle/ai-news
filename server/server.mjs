import { createReadStream } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi, scheduleDaily } from './api.mjs'
import { resolveStaticFile } from './static.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'docs', '.vitepress', 'dist')
const PORT = Number(process.env.PORT || 4173)
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
}

async function staticFile(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const { file, status } = await resolveStaticFile(DIST, url.pathname)
  if (!file) {
    res.writeHead(status).end(status === 403 ? 'Forbidden' : 'Bad request')
    return
  }
  const stream = createReadStream(file)
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(404)
    res.end('Not found')
  })
  res.writeHead(status, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  stream.pipe(res)
}

const server = createServer(async (req, res) => {
  try {
    if (!await handleApi(req, res)) await staticFile(req, res)
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: error.message }))
  }
})

const next = scheduleDaily()
server.listen(PORT, '0.0.0.0', () => {
  console.log(`AI 今日雷达：http://localhost:${PORT}`)
  console.log(`下次自动刷新：${next.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
})
