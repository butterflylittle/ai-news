import assert from 'node:assert/strict'
import test from 'node:test'
import refreshHandler from '../api/refresh.js'

test('Vercel refresh endpoint rejects missing authorization', async () => {
  process.env.REFRESH_SECRET = 'test-secret'
  process.env.GH_ACTIONS_TOKEN = 'test-token'
  const response = await refreshHandler.fetch(new Request('https://example.com/api/refresh', { method: 'POST' }))
  assert.equal(response.status, 401)
})

test('Vercel refresh endpoint dispatches the GitHub workflow', async () => {
  const originalFetch = globalThis.fetch
  process.env.REFRESH_SECRET = 'test-secret'
  process.env.GH_ACTIONS_TOKEN = 'test-token'
  let call
  globalThis.fetch = async (url, options) => {
    call = { url, options }
    return new Response(null, { status: 204 })
  }

  try {
    const response = await refreshHandler.fetch(new Request('https://example.com/api/refresh', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' }
    }))
    assert.equal(response.status, 202)
    assert.match(call.url, /butterflylittle\/ai-news\/actions\/workflows\/refresh\.yml\/dispatches$/)
    assert.equal(JSON.parse(call.options.body).ref, 'main')
  } finally {
    globalThis.fetch = originalFetch
  }
})
