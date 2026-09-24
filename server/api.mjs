import { readStore, runPipeline } from '../scripts/feed.mjs'

const runtime = {
  phase: 'idle',
  startedAt: null,
  finishedAt: null,
  error: null,
  nextScheduledAt: null,
  promise: null
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function getStatus() {
  return { ...runtime, promise: undefined }
}

export function triggerRefresh(reason = 'manual') {
  if (runtime.promise) return runtime.promise
  runtime.phase = 'collecting'
  runtime.startedAt = new Date().toISOString()
  runtime.finishedAt = null
  runtime.error = null
  runtime.promise = runPipeline({ reason })
    .then((store) => {
      runtime.phase = 'complete'
      runtime.finishedAt = new Date().toISOString()
      return store
    })
    .catch((error) => {
      runtime.phase = 'failed'
      runtime.error = error.message
      runtime.finishedAt = new Date().toISOString()
      throw error
    })
    .finally(() => {
      runtime.promise = null
    })
  return runtime.promise
}

export async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/healthz') {
    json(res, 200, { ok: true })
    return true
  }
  if (url.pathname === '/api/data' && req.method === 'GET') {
    json(res, 200, await readStore())
    return true
  }
  if (url.pathname === '/api/status' && req.method === 'GET') {
    json(res, 200, getStatus())
    return true
  }
  if (url.pathname === '/api/refresh' && req.method === 'POST') {
    const alreadyRunning = Boolean(runtime.promise)
    triggerRefresh('manual').catch(() => {})
    json(res, alreadyRunning ? 200 : 202, { accepted: !alreadyRunning, status: getStatus() })
    return true
  }
  return false
}

function nextNine(now = new Date()) {
  const shanghai = new Date(now.valueOf() + 8 * 3_600_000)
  const target = new Date(shanghai)
  target.setUTCHours(9, 0, 0, 0)
  if (target <= shanghai) target.setUTCDate(target.getUTCDate() + 1)
  return new Date(target.valueOf() - 8 * 3_600_000)
}

export function scheduleDaily() {
  const next = nextNine()
  runtime.nextScheduledAt = next.toISOString()
  const delay = Math.max(1_000, next.valueOf() - Date.now())
  const timer = setTimeout(async () => {
    try {
      await triggerRefresh('schedule')
    } catch (error) {
      console.error('Scheduled refresh failed:', error)
    } finally {
      scheduleDaily()
    }
  }, delay)
  timer.unref?.()
  return next
}

export { nextNine }
