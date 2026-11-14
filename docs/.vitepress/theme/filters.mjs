export function readFilters(search = '') {
  const params = new URLSearchParams(search)
  return {
    category: params.get('category') || '全部',
    platform: params.get('platform') || '全部',
    source: params.get('source') || '全部',
    q: params.get('q') || '',
    showHidden: params.get('hidden') === '1'
  }
}

function queryHref(path, values) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value && (key === 'q' || value !== '全部')) params.set(key, value)
  }
  return `${path}${params.size ? `?${params}` : ''}`
}

export function radarHref(filters = {}) {
  return queryHref('/radar', {
    category: filters.category, platform: filters.platform, source: filters.source,
    q: filters.q, hidden: filters.showHidden ? '1' : ''
  })
}

export function sourcesHref(platform) {
  return queryHref('/sources', { platform })
}

export function filterItems(items, filters, hidden = new Set()) {
  const needle = filters.q.trim().toLowerCase()
  return items.filter((item) => {
    if (!filters.showHidden && hidden.has(item.id)) return false
    if (filters.category !== '全部' && item.category !== filters.category) return false
    if (filters.platform !== '全部' && !item.sources.some((source) => source.platform === filters.platform)) return false
    if (filters.source !== '全部' && !item.sources.some((source) => source.id === filters.source)) return false
    return !needle || `${item.titleZh || ''} ${item.summaryZh || ''} ${item.title} ${item.summary} ${item.keywordHits.join(' ')}`.toLowerCase().includes(needle)
  })
}
