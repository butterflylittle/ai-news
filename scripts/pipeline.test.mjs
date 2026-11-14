import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { clusterItems, fetchWithTimeout, normalize, parseCount, parseFeed, parseXTrends, rankItem, renderDailyMarkdown, titleSimilarity } from './feed.mjs'
import { nextNine } from '../server/api.mjs'

const source = { id: 'test', name: 'Test Feed', platform: 'official', weight: 30, primary: true }
const configuredKeywords = JSON.parse(readFileSync(new URL('../config/keywords.json', import.meta.url), 'utf8'))

test('keeps the RSS timeout active until the response body has been read', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let requestSignal
  let bodyStarted
  const reading = new Promise((resolve) => { bodyStarted = resolve })
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    requestSignal = signal
    return { ok: true, text: () => {
      bodyStarted()
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    } }
  })
  const result = fetchWithTimeout('https://example.com/stalled-feed')
  result.catch(() => {})
  await reading
  t.mock.timers.tick(15_000)
  assert.equal(requestSignal.aborted, true)
  await assert.rejects(result, { name: 'AbortError' })
})

const topicKeywords = {
  global: ['ai', 'agent'],
  topics: {
    GEO: ['geo', 'generative engine optimization', 'ai search'],
    Shopify: ['shopify'],
    SEO: ['seo', 'search engine optimization'],
    独立站: ['独立站', 'ecommerce']
  },
  categories: { 产品更新: ['launch', 'release', 'preview'], Agent: ['agent'] }
}

function normalized(title, options = {}) {
  return normalize({ title, summary: '', url: 'https://example.com/article', source, ...options }, topicKeywords, new Date('2026-11-14T02:00:00Z'))
}

test('collects commerce and search topics without requiring AI keywords', () => {
  for (const [title, category, keyword] of [
    ['独立站运营指南', '独立站', '独立站'],
    ['SEO indexing checklist', 'SEO', 'seo'],
    ['GEO citation research', 'GEO', 'geo'],
    ['Shopify checkout improvements', 'Shopify', 'shopify']
  ]) {
    const item = normalized(title)
    assert.equal(item.category, category)
    assert.ok(item.keywordHits.includes(keyword), title)
  }
})

test('keeps specific topics ahead of generic update keywords', () => {
  assert.equal(normalized('GEO release preview launch').category, 'GEO')
  assert.equal(normalized('SEO and AI search').category, 'GEO')
})

test('uses source defaults when an update omits its topic name', () => {
  const shopify = { ...source, defaultCategory: 'Shopify' }
  assert.equal(normalized('New checkout release', { source: shopify }).category, 'Shopify')
  assert.equal(normalized('AI search guide', { source: shopify }).category, 'GEO')
  assert.equal(normalized('Warehouse operations', { source: { ...source, defaultCategory: '独立站' } }).category, '独立站')
})

test('does not match short English keywords inside unrelated words', () => {
  const item = normalized('Geography in Seoul: a retail newsletter')
  assert.deepEqual(item.keywordHits, [])
  assert.equal(item.category, '其他')
  assert.deepEqual(normalized('AI应用与SEO优化、GEO指南').keywordHits.sort(), ['ai', 'geo', 'seo'])
})

test('preserves existing AI classification and configurations without topics', () => {
  assert.equal(normalized('AI agent tools').category, 'Agent')
  const item = normalize({ title: 'AI agent tools', summary: '', url: 'https://example.com/ai', source }, {
    global: ['ai', 'agent'], categories: { Agent: ['agent'] }
  }, new Date('2026-11-14T02:00:00Z'))
  assert.equal(item.category, 'Agent')
  assert.deepEqual(item.keywordHits, ['ai', 'agent'])
})

test('does not classify AI models or LLMON as generative search optimization', () => {
  for (const title of ['OpenAI models for coding', 'New AI models', 'LLMON: An LLM-Native Markup Language']) {
    const item = normalize({ title, summary: '', url: 'https://example.com/model', source }, configuredKeywords, new Date('2026-11-14T02:00:00Z'))
    assert.notEqual(item.category, 'GEO', title)
    assert.ok(!item.keywordHits.includes('ai mode') && !item.keywordHits.includes('llmo'), title)
  }
})

test('recognizes acronym and topic plurals with the configured keywords', () => {
  for (const [title, category, keyword] of [
    ['Why LLMs hallucinate', '模型发布', 'llm'],
    ['Optimizing for AI Overviews', 'GEO', 'ai overview'],
    ['Checkout inside AI Mode', 'GEO', 'ai mode'],
    ['Growing online stores', '独立站', 'online store'],
    ['Earning backlinks', 'SEO', 'backlink']
  ]) {
    const item = normalize({ title, summary: '', url: 'https://example.com/plural', source }, configuredKeywords, new Date('2026-11-14T02:00:00Z'))
    assert.equal(item.category, category, title)
    assert.ok(item.keywordHits.includes(keyword), title)
  }
})

test('parses RSS and Atom feeds', () => {
  const rss = `<?xml version="1.0"?><rss><channel><item><title>AI &amp; agents</title><link>https://example.com/a</link><description><![CDATA[<p>A useful release.</p>]]></description><pubDate>Wed, 23 Sep 2026 01:00:00 GMT</pubDate></item></channel></rss>`
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>MCP release</title><link rel="alternate" href="https://example.com/b"/><summary>Tools</summary><updated>2026-09-23T02:00:00Z</updated></entry></feed>`
  assert.equal(parseFeed(rss, source)[0].title, 'AI & agents')
  assert.equal(parseFeed(atom, source)[0].url, 'https://example.com/b')
})

test('filters a shared RSS feed to AppSo articles', () => {
  const rss = '<rss><channel><item><title>AppSo AI</title><link>https://example.com/appso</link><category>AppSo</category></item><item><title>iFanr AI</title><link>https://example.com/ifanr</link><category>公司</category></item></channel></rss>'
  const entries = parseFeed(rss, { id: 'appso', includeCategory: 'AppSo' })
  assert.deepEqual(entries.map((entry) => entry.title), ['AppSo AI'])
})

test('parses social popularity signals', () => {
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:rsshub="https://docs.rsshub.app"><entry><title>AI Coding 新工具</title><link href="https://example.com/xhs"/><updated>2026-09-23T02:00:00Z</updated><rsshub:upvotes>1.2万</rsshub:upvotes></entry></feed>`
  assert.equal(parseCount('1.2万'), 12_000)
  assert.equal(parseFeed(atom, source)[0].engagement.upvotes, 12_000)

  const trends = parseXTrends({ data: [{ trend_name: 'Claude Code', tweet_count: 42000 }] }, { ...source, platform: 'x' }, new Date('2026-09-23T02:00:00Z'))
  assert.equal(trends[0].title, 'Claude Code')
  assert.equal(trends[0].engagement.posts, 42_000)
})

test('clusters similar headlines and rewards corroboration', () => {
  const base = {
    id: 'a', title: 'OpenAI 发布新的 Agent 工具套件', summary: 'A', url: 'https://a.test', author: '',
    publishedAt: '2026-09-23T01:00:00.000Z', category: 'Agent', keywordHits: ['agent'], primary: true,
    sources: [{ id: 'one', name: 'One', platform: 'official', url: 'https://a.test' }], sourceWeight: 30
  }
  const sibling = {
    ...base, id: 'b', title: 'OpenAI 发布全新 Agent 工具套件', url: 'https://b.test', primary: false,
    sources: [{ id: 'two', name: 'Two', platform: 'media', url: 'https://b.test' }], sourceWeight: 18
  }
  assert.ok(titleSimilarity(base.title, sibling.title) >= 0.68)
  const [cluster] = clusterItems([base, sibling])
  assert.equal(cluster.sources.length, 2)
  assert.ok(rankItem(cluster, new Date('2026-09-23T03:00:00Z')).score >= 70)
})

test('rewards popular posts without letting popularity dominate', () => {
  const item = {
    title: 'AI Coding 工具', publishedAt: '2026-09-23T01:00:00Z', keywordHits: ['ai coding'],
    sources: [{ id: 'xhs' }], sourceWeight: 16, primary: false, engagement: { upvotes: 10_000 }
  }
  const ranked = rankItem(item, new Date('2026-09-23T03:00:00Z'))
  assert.equal(ranked.score, 56)
})

test('renders a durable markdown daily', () => {
  const store = {
    meta: { updatedAt: '2026-09-23T03:00:00Z', successfulSources: 1, enabledSources: 1 },
    items: [{ title: 'A [release]', level: '头条', score: 90, category: '产品更新', summary: 'Summary', url: 'https://example.com', sources: [{ name: 'Official' }] }]
  }
  const markdown = renderDailyMarkdown(store, '2026-09-23')
  assert.match(markdown, /# 2026-09-23 · AI 今日雷达/)
  assert.ok(markdown.includes('A \\[release\\]'))
})

test('renders translated daily text while keeping the original article URL', () => {
  const item = { title: 'New checkout features', summary: 'A faster checkout.', titleZh: '新增结账功能', summaryZh: '结账更快捷。',
    level: '值得看', score: 60, category: 'Shopify', url: 'https://example.com/original', sources: [{ name: 'Shopify' }] }
  const markdown = renderDailyMarkdown({ meta: { updatedAt: '2026-11-14T02:00:00Z', successfulSources: 1, enabledSources: 1 }, items: [item] }, '2026-11-14')
  assert.ok(markdown.includes('## 新增结账功能'))
  assert.ok(markdown.includes('结账更快捷。'))
  assert.ok(markdown.includes('[查看原文](https://example.com/original)'))
})

test('schedules 09:00 in Asia/Shanghai', () => {
  assert.equal(nextNine(new Date('2026-09-23T00:00:00Z')).toISOString(), '2026-09-23T01:00:00.000Z')
  assert.equal(nextNine(new Date('2026-09-23T02:00:00Z')).toISOString(), '2026-09-24T01:00:00.000Z')
})
