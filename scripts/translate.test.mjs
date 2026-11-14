import assert from 'node:assert/strict'
import test from 'node:test'
import { translateItems, translateText } from './translate.mjs'

const article = {
  id: 'news', title: 'New checkout features', summary: 'A faster checkout for merchants.',
  url: 'https://example.com/original', sources: [{ id: 'shopify', url: 'https://example.com/original' }]
}

test('translates every sentence returned by the keyless endpoint', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.searchParams.get('q'), 'Hello. Welcome!')
    assert.equal(url.searchParams.get('tl'), 'zh-CN')
    assert.ok(options.signal)
    return Response.json([[['你好。', 'Hello.'], ['欢迎！', 'Welcome!']], null, 'en'])
  })
  assert.equal(await translateText('Hello. Welcome!'), '你好。欢迎！')
})

test('rejects HTTP errors and malformed translation payloads', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 429 }))
  await assert.rejects(translateText('Hello'), /429/)
  fetch.mock.mockImplementation(async () => Response.json({ error: 'bad response' }))
  await assert.rejects(translateText('Hello'), /翻译/)
  fetch.mock.mockImplementation(async () => Response.json([[[null, 'Hello']]]))
  await assert.rejects(translateText('Hello'), /翻译/)
})

test('adds Chinese fields without changing original text or article links', async () => {
  const original = structuredClone(article)
  const { items, stats } = await translateItems([article], [], { translate: async (value) => ({
    'New checkout features': '新增结账功能',
    'A faster checkout for merchants.': '为商家提供更快捷的结账体验。'
  })[value] })
  assert.equal(items[0].titleZh, '新增结账功能')
  assert.equal(items[0].summaryZh, '为商家提供更快捷的结账体验。')
  assert.equal(items[0].title, article.title)
  assert.equal(items[0].summary, article.summary)
  assert.equal(items[0].url, article.url)
  assert.deepEqual(items[0].sources, article.sources)
  assert.deepEqual(article, original)
  assert.equal(stats.translatedFields, 2)
  assert.equal(stats.pendingFields, 0)
})

test('reuses translations by exact source text and retranslates only changed fields', async () => {
  const previous = { ...article, titleZh: '新增结账功能', summaryZh: '为商家提供更快捷的结账体验。' }
  const changed = { ...previous, id: 'clustered', summary: 'Improved shipping options.' }
  const calls = []
  const { items, stats } = await translateItems([changed], [previous], { translate: async (value) => {
    calls.push(value)
    return '改进配送选项。'
  } })
  assert.equal(items[0].titleZh, '新增结账功能')
  assert.equal(items[0].summaryZh, '改进配送选项。')
  assert.deepEqual(calls, ['Improved shipping options.'])
  assert.equal(stats.cachedFields, 1)
})

test('skips Chinese content, empty fields, and version-only titles', async () => {
  let requests = 0
  const { items, stats } = await translateItems([
    { id: 'zh', title: 'Shopify 发布新功能', summary: '支持 AI 搜索。' },
    { id: 'version', title: 'v2.4.0', summary: '' }
  ], [], { translate: async () => { requests += 1; return '不应翻译' } })
  assert.equal(requests, 0)
  assert.equal(items[0].title, 'Shopify 发布新功能')
  assert.equal(items[0].titleZh, undefined)
  assert.equal(stats.pendingFields, 0)
})

test('deduplicates identical source text within the same refresh', async () => {
  let requests = 0
  const { items } = await translateItems([
    { ...article, summary: '' }, { ...article, id: 'another', summary: '' }
  ], [], { translate: async () => { requests += 1; return '新增结账功能' } })
  assert.equal(requests, 1)
  assert.deepEqual(items.map((item) => item.titleZh), ['新增结账功能', '新增结账功能'])
})

test('preserves successful translations and falls back to originals on failure', async () => {
  const { items, stats } = await translateItems([article], [], { translate: async (value) => {
    if (value === article.title) return '新增结账功能'
    throw new Error('HTTP 429')
  } })
  assert.equal(items[0].titleZh, '新增结账功能')
  assert.equal(items[0].summaryZh, undefined)
  assert.equal(items[0].summary, article.summary)
  assert.equal(stats.pendingFields, 1)
  assert.match(stats.lastError, /429/)
  const retry = await translateItems(items, items, { translate: async () => '为商家提供更快捷的结账体验。' })
  assert.equal(retry.items[0].titleZh, '新增结账功能')
  assert.equal(retry.items[0].summaryZh, '为商家提供更快捷的结账体验。')
})

test('bounds concurrent requests and stops scheduling after repeated failures', async () => {
  let active = 0
  let peak = 0
  let requests = 0
  const entries = Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: `Article number ${i}`, summary: '' }))
  const { items, stats } = await translateItems(entries, [], { translate: async () => {
    requests += 1
    active += 1
    peak = Math.max(active, peak)
    await new Promise((resolve) => setTimeout(resolve, 2))
    active -= 1
    throw new Error('Service unavailable')
  } })
  assert.ok(peak > 0 && peak <= 3)
  assert.ok(requests < entries.length)
  assert.equal(items.length, 20)
  assert.equal(stats.pendingFields, 20)
})
