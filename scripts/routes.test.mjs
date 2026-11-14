import assert from 'node:assert/strict'
import test from 'node:test'
import { filterItems, radarHref, readFilters, sourcesHref } from '../docs/.vitepress/theme/filters.mjs'

test('restores all radar controls from a shared URL', () => {
  assert.deepEqual(readFilters('?category=Shopify&platform=official&source=shopify-changelog&q=%E7%BB%93%E8%B4%A6&hidden=1'), {
    category: 'Shopify', platform: 'official', source: 'shopify-changelog', q: '结账', showHidden: true
  })
})

test('uses defaults for empty parameters and accepts only hidden=1', () => {
  assert.deepEqual(readFilters('?category=&platform=&source=&q=&hidden=false'), {
    category: '全部', platform: '全部', source: '全部', q: '', showHidden: false
  })
  assert.equal(readFilters('?hidden=true').showHidden, false)
})

test('encodes Chinese and special characters without changing the search text', () => {
  const filters = { category: '独立站', platform: 'media', source: 'news', q: 'AI + SEO & 结账?', showHidden: true }
  const href = radarHref(filters)
  assert.ok(href.startsWith('/radar?'))
  assert.deepEqual(readFilters(new URL(href, 'https://example.com').search), filters)
})

test('omits defaults and isolates sources page filters from radar filters', () => {
  assert.equal(radarHref(readFilters('')), '/radar')
  assert.equal(radarHref({ category: 'GEO' }), '/radar?category=GEO')
  assert.equal(radarHref({ source: 'shopify-changelog' }), '/radar?source=shopify-changelog')
  assert.equal(sourcesHref('official'), '/sources?platform=official')
  assert.equal(sourcesHref('全部'), '/sources')
})

test('allows searching for the literal word 全部', () => {
  assert.equal(readFilters(new URL(radarHref({ q: '全部' }), 'https://example.com').search).q, '全部')
})

test('applies combined URL filters and searches both original and Chinese text', () => {
  const items = [
    { id: 'a', title: 'Checkout update', titleZh: '结账更新', summary: '', summaryZh: '支持快捷支付', category: 'Shopify', keywordHits: [], sources: [{ id: 'shopify', platform: 'official' }] },
    { id: 'b', title: 'Checkout tips', titleZh: '结账建议', summary: '', category: 'Shopify', keywordHits: [], sources: [{ id: 'news', platform: 'media' }] },
    { id: 'c', title: 'AI search', titleZh: '搜索更新', summary: '', category: 'GEO', keywordHits: ['geo'], sources: [{ id: 'news', platform: 'media' }] }
  ]
  const filters = readFilters('?category=Shopify&platform=official&source=shopify&q=结账')
  assert.deepEqual(filterItems(items, filters).map((item) => item.id), ['a'])
  assert.deepEqual(filterItems(items, { ...filters, q: 'CHECKOUT' }).map((item) => item.id), ['a'])
  assert.deepEqual(filterItems(items, { ...filters, q: '快捷支付' }).map((item) => item.id), ['a'])
  assert.deepEqual(filterItems(items, filters, new Set(['a'])), [])
  assert.deepEqual(filterItems(items, { ...filters, showHidden: true }, new Set(['a'])).map((item) => item.id), ['a'])
  assert.deepEqual(filterItems(items, readFilters('?category=missing')), [])
})
