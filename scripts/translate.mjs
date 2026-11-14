export async function translateText(value, { signal } = {}) {
  // shortcut: This keyless web endpoint has no SLA; replace it with an official API if reliability becomes critical.
  const url = new URL('https://translate.googleapis.com/translate_a/single')
  url.search = new URLSearchParams({ client: 'gtx', sl: 'en', tl: 'zh-CN', dt: 't', q: value })
  const timeout = AbortSignal.timeout(12_000)
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  if (!response.ok) throw new Error(`翻译接口 HTTP ${response.status}`)
  const payload = await response.json()
  const sentences = payload?.[0]
  if (!Array.isArray(sentences) || !sentences.length || sentences.some((sentence) => typeof sentence?.[0] !== 'string')) {
    throw new Error('翻译接口返回无效数据')
  }
  const translated = sentences.map((sentence) => sentence[0]).join('').trim()
  if (!translated) throw new Error('翻译接口返回空译文')
  return translated
}

function needsTranslation(value) {
  return typeof value === 'string' && /[a-z]{2}/i.test(value) && !/\p{Script=Han}/u.test(value)
}

export async function translateItems(sourceItems, previousItems = [], { translate = translateText } = {}) {
  const cache = new Map()
  for (const item of previousItems) {
    for (const field of ['title', 'summary']) {
      const translated = item[`${field}Zh`]
      if (item[field] && typeof translated === 'string' && translated.trim()) cache.set(item[field], translated)
    }
  }

  const stats = { provider: 'google-web', targetLanguage: 'zh-CN', translatedFields: 0, cachedFields: 0, pendingFields: 0, lastError: null }
  const pending = new Map()
  const items = sourceItems.map(({ titleZh, summaryZh, ...item }) => {
    for (const field of ['title', 'summary']) {
      const original = item[field]
      if (!needsTranslation(original)) continue
      const translatedField = `${field}Zh`
      if (cache.has(original)) {
        item[translatedField] = cache.get(original)
        stats.cachedFields += 1
      } else {
        if (!pending.has(original)) pending.set(original, [])
        pending.get(original).push({ item, field: translatedField })
        stats.pendingFields += 1
      }
    }
    return item
  })

  const jobs = [...pending]
  const signal = AbortSignal.timeout(120_000)
  let next = 0
  let failures = 0
  async function worker() {
    while (next < jobs.length && failures < 3 && !signal.aborted) {
      const [original, destinations] = jobs[next++]
      try {
        const translated = await translate(original, { signal })
        if (typeof translated !== 'string' || !translated.trim()) throw new Error('翻译接口返回空译文')
        for (const { item, field } of destinations) item[field] = translated.trim()
        stats.translatedFields += destinations.length
        stats.pendingFields -= destinations.length
      } catch (error) {
        failures += 1
        stats.lastError = ['TimeoutError', 'AbortError'].includes(error.name) ? '翻译请求超时' : error.message
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker))
  if (signal.aborted && stats.pendingFields) stats.lastError = '翻译等待超时，剩余内容将在下次刷新时重试'
  return { items, stats }
}
