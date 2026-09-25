import assert from 'node:assert/strict'
import test from 'node:test'
import { clusterItems, parseCount, parseFeed, parseXTrends, rankItem, renderDailyMarkdown, titleSimilarity } from './feed.mjs'
import { nextNine } from '../server/api.mjs'

const source = { id: 'test', name: 'Test Feed', platform: 'official', weight: 30, primary: true }

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

test('schedules 09:00 in Asia/Shanghai', () => {
  assert.equal(nextNine(new Date('2026-09-23T00:00:00Z')).toISOString(), '2026-09-23T01:00:00.000Z')
  assert.equal(nextNine(new Date('2026-09-23T02:00:00Z')).toISOString(), '2026-09-24T01:00:00.000Z')
})
