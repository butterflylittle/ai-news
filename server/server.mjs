import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi, scheduleDaily } from './api.mjs'

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
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
  const file = path.resolve(DIST, `.${requested}`)
  if (!file.startsWith(`${DIST}${path.sep}`) && file !== path.join(DIST, 'index.html')) {
    res.writeHead(403).end('Forbidden')
    return
  }
  try {
    const info = await stat(file)
    if (!info.isFile()) throw new Error('not a file')
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  } catch {
    res.writeHead(200, { 'content-type': TYPES['.html'] })
    createReadStream(path.join(DIST, 'index.html')).pipe(res)
  }
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
