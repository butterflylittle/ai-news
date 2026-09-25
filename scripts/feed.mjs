import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { XMLParser } from 'fast-xml-parser'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_PATH = path.join(ROOT, 'config', 'feeds.json')
const KEYWORDS_PATH = path.join(ROOT, 'config', 'keywords.json')
const STORE_PATH = path.join(ROOT, 'data', 'store.json')
const DAILY_DIR = path.join(ROOT, 'data', 'daily')
const DAY_MS = 86_400_000

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true
})

const list = (value) => value == null ? [] : Array.isArray(value) ? value : [value]

function text(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' ')
  return text(value['#text'] ?? value.__cdata ?? value.name ?? '')
}

function compact(value) {
  return text(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseCount(value) {
  const raw = compact(value).replace(/,/g, '').toLowerCase()
  const amount = Number.parseFloat(raw)
  if (!Number.isFinite(amount)) return 0
  if (raw.includes('万') || raw.endsWith('w')) return Math.round(amount * 10_000)
  if (raw.endsWith('k')) return Math.round(amount * 1_000)
  return Math.round(amount)
}

function atomLink(value) {
  const links = list(value)
  const alternate = links.find((entry) => typeof entry === 'object' && (!entry['@_rel'] || entry['@_rel'] === 'alternate'))
  return alternate?.['@_href'] ?? links[0]?.['@_href'] ?? text(links[0])
}

export function parseFeed(xml, source) {
  const parsed = parser.parse(xml)
  const channel = parsed.rss?.channel ?? parsed['rdf:RDF']?.channel
  const entries = channel ? list(channel.item ?? parsed['rdf:RDF']?.item) : list(parsed.feed?.entry)

  return entries
    .filter((entry) => !source.includeCategory || list(entry.category).some((category) => compact(category) === source.includeCategory))
    .map((entry) => ({
      title: compact(entry.title),
      url: channel ? text(entry.link ?? entry.guid) : atomLink(entry.link),
      summary: compact(entry.description ?? entry['content:encoded'] ?? entry.summary ?? entry.content),
      publishedAt: text(entry.pubDate ?? entry['dc:date'] ?? entry.published ?? entry.updated),
      author: compact(entry.author?.name ?? entry.author ?? entry['dc:creator']),
      engagement: {
        upvotes: parseCount(entry['rsshub:upvotes'] ?? entry.upvotes),
        comments: parseCount(entry['rsshub:comments'] ?? entry.comments)
      },
      source
    })).filter((entry) => entry.title && entry.url)
}

export function parseXTrends(payload, source, now = new Date()) {
  const trends = list(payload.data ?? payload.trends)
  return trends.map((trend) => {
    const title = compact(trend.trend_name ?? trend.name ?? trend.trend?.name)
    const tweetCount = parseCount(trend.tweet_count ?? trend.tweet_volume)
    return {
      title,
      url: `https://x.com/search?q=${encodeURIComponent(title)}&src=trend_click`,
      summary: tweetCount ? `X 全球趋势 · 约 ${tweetCount.toLocaleString('zh-CN')} 条帖子` : 'X 全球趋势',
      publishedAt: now.toISOString(),
      author: 'X Trends',
      engagement: { posts: tweetCount },
      source
    }
  }).filter((entry) => entry.title)
}

function resolveEnv(value) {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] ?? '')
}

function canonicalUrl(raw) {
  try {
    const url = new URL(raw)
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|spm$|from$)/i.test(key)) url.searchParams.delete(key)
    }
    url.hash = ''
    return url.toString()
  } catch {
    return raw
  }
}

function fingerprint(title) {
  return title.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

function grams(value) {
  const normalized = fingerprint(value)
  const output = new Set()
  for (let i = 0; i < normalized.length - 1; i += 1) output.add(normalized.slice(i, i + 2))
  return output
}

export function titleSimilarity(a, b) {
  const left = grams(a)
  const right = grams(b)
  if (!left.size || !right.size) return 0
  let overlap = 0
  for (const token of left) if (right.has(token)) overlap += 1
  return overlap / (left.size + right.size - overlap)
}

function validDate(value, fallback = new Date()) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? fallback : date
}

function categoryFor(content, categories) {
  let best = ['其他', 0]
  for (const [name, words] of Object.entries(categories)) {
    const hits = words.filter((word) => content.includes(word.toLowerCase())).length
    if (hits > best[1]) best = [name, hits]
  }
  return best[0]
}

function normalize(entry, keywords, now) {
  const title = compact(entry.title).replace(/^\*\*(.+)\*\*$/, '$1')
  const summary = compact(entry.summary).slice(0, 320)
  const haystack = `${title} ${summary}`.toLowerCase()
  const keywordHits = keywords.global.filter((word) => haystack.includes(word.toLowerCase()))
  const publishedAt = validDate(entry.publishedAt, now).toISOString()
  const url = canonicalUrl(entry.url)

  return {
    id: createHash('sha1').update(url || title).digest('hex').slice(0, 12),
    title,
    summary,
    url,
    author: entry.author,
    engagement: entry.engagement ?? {},
    publishedAt,
    category: categoryFor(haystack, keywords.categories),
    keywordHits: [...new Set(keywordHits)].slice(0, 8),
    primary: Boolean(entry.source.primary),
    sources: [{
      id: entry.source.id,
      name: entry.source.name,
      platform: entry.source.platform,
      url
    }],
    sourceWeight: entry.source.weight ?? 10
  }
}

function mergeItem(target, incoming) {
  const sourceIds = new Set(target.sources.map((source) => source.id))
  target.sources.push(...incoming.sources.filter((source) => !sourceIds.has(source.id)))
  target.primary ||= incoming.primary
  target.sourceWeight = Math.max(target.sourceWeight, incoming.sourceWeight)
  target.keywordHits = [...new Set([...target.keywordHits, ...incoming.keywordHits])]
  target.engagement = {
    upvotes: Math.max(target.engagement?.upvotes ?? 0, incoming.engagement?.upvotes ?? 0),
    comments: Math.max(target.engagement?.comments ?? 0, incoming.engagement?.comments ?? 0),
    posts: Math.max(target.engagement?.posts ?? 0, incoming.engagement?.posts ?? 0)
  }
  if (incoming.summary.length > target.summary.length) target.summary = incoming.summary
  if (new Date(incoming.publishedAt) < new Date(target.publishedAt)) target.publishedAt = incoming.publishedAt
}

export function clusterItems(items) {
  const clusters = []
  // ponytail: O(n²) is simpler and fine below ~1,000 feed items; index titles if that ceiling is reached.
  for (const item of items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))) {
    const match = clusters.find((candidate) =>
      candidate.url === item.url ||
      fingerprint(candidate.title) === fingerprint(item.title) ||
      titleSimilarity(candidate.title, item.title) >= 0.68
    )
    if (match) mergeItem(match, item)
    else clusters.push(structuredClone(item))
  }
  return clusters
}

export function rankItem(item, now = new Date()) {
  const ageHours = Math.max(0, (now - new Date(item.publishedAt)) / 3_600_000)
  const freshness = ageHours <= 6 ? 25 : ageHours <= 24 ? 20 : ageHours <= 72 ? 12 : ageHours <= 168 ? 5 : 0
  const keywordScore = Math.min(15, item.keywordHits.length * 3)
  const corroboration = Math.min(15, Math.max(0, item.sources.length - 1) * 5)
  const engagement = Math.max(item.engagement?.upvotes ?? 0, item.engagement?.posts ?? 0)
  const popularity = Math.min(15, Math.floor(Math.log10(engagement + 1) * 3))
  const score = Math.min(100, item.sourceWeight + freshness + keywordScore + corroboration + popularity + (item.primary ? 10 : 0))
  const level = score >= 75 ? '头条' : score >= 55 ? '值得看' : score >= 35 ? '正在升温' : '仅记录'
  return { ...item, score, level }
}

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

export async function readStore() {
  return loadJson(STORE_PATH, { meta: {}, items: [], sources: [], archive: [] })
}

async function fetchSource(source) {
  const startedAt = Date.now()
  try {
    if (source.type === 'x-trends') {
      const token = process.env[source.tokenEnv]
      const response = await fetchWithTimeout(resolveEnv(source.url), { authorization: `Bearer ${token}` })
      const entries = parseXTrends(JSON.parse(response), source)
      return {
        entries,
        status: sourceStatus(source, startedAt, true, entries.length)
      }
    }

    if (source.type === 'xiaohongshu-pool') {
      const ids = sourceUserIds(source)
      const route = resolveEnv(source.url)
      const results = await Promise.all(ids.map(async (id) => {
        try {
          return parseFeed(await fetchWithTimeout(route.replace('{userId}', encodeURIComponent(id))), source)
        } catch {
          return null
        }
      }))
      const successful = results.filter(Boolean)
      if (!successful.length) throw new Error('账号池 RSS 全部读取失败')
      const entries = successful.flat()
        .filter((entry) => (entry.engagement?.upvotes ?? 0) >= (source.minUpvotes ?? 0))
        .sort((a, b) => (b.engagement?.upvotes ?? 0) - (a.engagement?.upvotes ?? 0))
        .slice(0, source.maxItems ?? 30)
      return {
        entries,
        status: sourceStatus(source, startedAt, true, entries.length, `已读取 ${successful.length}/${ids.length} 个账号`)
      }
    }

    const url = resolveEnv(source.url)
    if (!url || url.includes('REPLACE_WITH')) throw new Error('数据源尚未配置')
    const entries = parseFeed(await fetchWithTimeout(url), source)
    return {
      entries,
      status: sourceStatus(source, startedAt, true, entries.length)
    }
  } catch (error) {
    return {
      entries: [],
      status: { ...sourceStatus(source, startedAt, false, 0), error: error.name === 'AbortError' ? '请求超时' : error.message }
    }
  }
}

async function fetchWithTimeout(url, extraHeaders = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'AI-News-Desk/0.1 (+local RSS reader)', ...extraHeaders }
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.text()
  } finally {
    clearTimeout(timeout)
  }
}

function sourceStatus(source, startedAt, ok, count, detail = '') {
  return {
    id: source.id,
    name: source.name,
    platform: source.platform,
    ok,
    count,
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
    note: detail || source.note || ''
  }
}

function sourceUserIds(source) {
  const envIds = process.env[source.userIdsEnv] ?? ''
  return [...new Set([...(source.userIds ?? []), ...envIds.split(',')]
    .map((id) => id.trim())
    .filter((id) => /^[a-zA-Z0-9]{24}$/.test(id)))]
}

function missingRequirement(source) {
  if (source.type === 'x-trends' && !process.env[source.tokenEnv]) return source.tokenEnv
  if (source.type === 'xiaohongshu-pool') {
    if (!process.env.RSSHUB_BASE) return 'RSSHUB_BASE'
    if (!sourceUserIds(source).length) return source.userIdsEnv
  }
  return null
}

function shanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function escapeMarkdown(value) {
  return value.replace(/[\[\]]/g, '\\$&')
}

export function renderDailyMarkdown(store, date) {
  const lines = [
    '---',
    `date: ${date}`,
    `updatedAt: ${store.meta.updatedAt}`,
    `items: ${store.items.length}`,
    '---',
    '',
    `# ${date} · AI 今日雷达`,
    '',
    `> 共收录 ${store.items.length} 条，成功读取 ${store.meta.successfulSources}/${store.meta.enabledSources} 个数据源。`,
    ''
  ]

  for (const item of store.items.slice(0, 60)) {
    lines.push(`## ${escapeMarkdown(item.title)}`, '')
    lines.push(`**${item.level} · ${item.score} 分 · ${item.category}**`, '')
    if (item.summary) lines.push(item.summary, '')
    lines.push(`来源：${item.sources.map((source) => source.name).join('、')} · [查看原文](${item.url})`, '')
  }
  return `${lines.join('\n')}\n`
}

async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  await writeFile(temp, content)
  await rename(temp, file)
}

export async function runPipeline({ reason = 'manual', now = new Date() } = {}) {
  const [config, keywords, previous] = await Promise.all([
    loadJson(CONFIG_PATH, { feeds: [], retentionDays: 7 }),
    loadJson(KEYWORDS_PATH, { global: [], exclude: [], categories: {} }),
    readStore()
  ])
  const requested = config.feeds.filter((source) => source.enabled)
  const pending = requested.filter(missingRequirement).map((source) => ({
    id: source.id,
    name: source.name,
    platform: source.platform,
    ok: null,
    pending: true,
    count: 0,
    checkedAt: null,
    note: `待配置 ${missingRequirement(source)} · ${source.note ?? ''}`
  }))
  const enabled = requested.filter((source) => !missingRequirement(source))
  const disabled = config.feeds.filter((source) => !source.enabled).map((source) => ({
    id: source.id,
    name: source.name,
    platform: source.platform,
    ok: null,
    count: 0,
    checkedAt: null,
    note: source.note ?? '未启用'
  }))
  const results = await Promise.all(enabled.map(fetchSource))
  const fetched = results.flatMap((result) => result.entries)
  const statuses = [...results.map((result) => result.status), ...pending, ...disabled]
  const excluded = (value) => keywords.exclude.some((word) => value.toLowerCase().includes(word.toLowerCase()))
  const cutoff = now.valueOf() - (config.retentionDays ?? 7) * DAY_MS
  const relevant = fetched
    .map((entry) => normalize(entry, keywords, now))
    .filter((item) => !excluded(`${item.title} ${item.summary}`))
    .filter((item) => item.keywordHits.length || item.sources.some((source) => enabled.find((feed) => feed.id === source.id)?.allowAll))
    .filter((item) => new Date(item.publishedAt).valueOf() >= cutoff)

  const existing = previous.items.filter((item) => new Date(item.publishedAt).valueOf() >= cutoff)
  const items = clusterItems([...relevant, ...existing])
    .map((item) => rankItem(item, now))
    .sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 400)

  const date = shanghaiDate(now)
  const archiveEntry = {
    date,
    itemCount: items.length,
    headlineIds: items.filter((item) => item.level === '头条').slice(0, 8).map((item) => item.id),
    updatedAt: now.toISOString()
  }
  const archive = [archiveEntry, ...(previous.archive ?? []).filter((entry) => entry.date !== date)].slice(0, 90)
  const successfulSources = statuses.filter((source) => source.ok === true).length
  const store = {
    meta: {
      updatedAt: now.toISOString(),
      date,
      reason,
      timezone: config.timezone ?? 'Asia/Shanghai',
      enabledSources: enabled.length,
      successfulSources,
      nextScheduledAt: null,
      empty: items.length === 0
    },
    items,
    sources: statuses,
    archive
  }

  await atomicWrite(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`)
  await atomicWrite(path.join(DAILY_DIR, `${date}.md`), renderDailyMarkdown(store, date))
  return store
}
