import { computed, inject, onMounted, onUnmounted, provide, ref } from 'vue'
import { useRouter } from 'vitepress'
import { readFilters } from './filters.mjs'

const DeskKey = Symbol('news-desk')
export const platformLabels = {
  official: '官方', developer: '开发者', research: '论文', media: '媒体',
  x: 'X', douyin: '抖音', xiaohongshu: '小红书'
}

export function dateKey(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

export function formatDate(value, options = {}) {
  if (!value) return '尚未更新'
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', ...options }).format(new Date(value))
}

export function timeAgo(value) {
  const diff = Date.now() - new Date(value).valueOf()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export function sourceNames(item) {
  return item.sources.map((source) => source.name).join(' · ')
}

export function provideDesk() {
  const router = useRouter()
  const data = ref({ meta: {}, items: [], sources: [], archive: [] })
  const refreshState = ref({ phase: 'idle' })
  const saved = ref(new Set())
  const hidden = ref(new Set())
  const loadError = ref('')
  const currentUrl = ref(router.route.path)
  const filters = computed(() => readFilters(new URL(currentUrl.value, 'http://localhost').search))
  const isRefreshing = computed(() => ['queued', 'collecting', 'remote'].includes(refreshState.value.phase))
  const isLocalHost = () => ['localhost', '127.0.0.1'].includes(window.location.hostname)
  let pollTimer
  let disposed = false
  const previousAfterRouteChange = router.onAfterRouteChange

  function syncUrl() {
    currentUrl.value = window.location.pathname + window.location.search
  }

  async function afterRouteChange(href) {
    await previousAfterRouteChange?.(href)
    syncUrl()
  }

  function setQuery(href, replace = false) {
    if (href === window.location.pathname + window.location.search) return
    const state = { ...window.history.state, scrollPosition: window.scrollY }
    if (!replace) window.history.replaceState(state, '')
    window.history[replace ? 'replaceState' : 'pushState'](state, '', href)
    syncUrl()
  }

  function persist() {
    localStorage.setItem('ai-news-saved', JSON.stringify([...saved.value]))
    localStorage.setItem('ai-news-hidden', JSON.stringify([...hidden.value]))
  }

  function toggle(setRef, id) {
    const next = new Set(setRef.value)
    next.has(id) ? next.delete(id) : next.add(id)
    setRef.value = next
    persist()
  }

  async function loadData() {
    const paths = isLocalHost() ? ['/api/data', '/data/store.json'] : ['/data/store.json', '/api/data']
    for (const path of paths) {
      try {
        const response = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' })
        if (!response.ok) continue
        data.value = await response.json()
        loadError.value = ''
        return
      } catch {
        // Try the fallback source.
      }
    }
    loadError.value = '数据读取失败：没有可用的数据源'
  }

  async function pollRefresh() {
    const response = await fetch('/api/status', { cache: 'no-store' })
    refreshState.value = await response.json()
    if (!disposed && isRefreshing.value) pollTimer = setTimeout(pollRefresh, 900)
    else if (refreshState.value.phase === 'complete') await loadData()
  }

  async function refresh() {
    if (isRefreshing.value) return
    refreshState.value = { phase: 'queued' }
    try {
      const headers = {}
      if (!isLocalHost()) {
        let secret = sessionStorage.getItem('ai-news-refresh-secret')
        if (!secret) secret = window.prompt('请输入工作台刷新密钥')?.trim()
        if (!secret) {
          refreshState.value = { phase: 'idle' }
          return
        }
        sessionStorage.setItem('ai-news-refresh-secret', secret)
        headers.authorization = `Bearer ${secret}`
      }

      const response = await fetch('/api/refresh', { method: 'POST', headers })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 401) sessionStorage.removeItem('ai-news-refresh-secret')
        throw new Error(result.error || `HTTP ${response.status}`)
      }
      if (result.remote) {
        refreshState.value = { phase: 'remote' }
        await waitForPublishedData(data.value.meta.updatedAt)
      } else {
        await pollRefresh()
      }
    } catch (error) {
      refreshState.value = { phase: 'failed', error: error.message }
    }
  }

  async function waitForPublishedData(previousUpdatedAt) {
    for (let attempt = 0; attempt < 36 && !disposed; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5_000))
      const response = await fetch(`/data/store.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!response.ok) continue
      const next = await response.json()
      if (next.meta.updatedAt && next.meta.updatedAt !== previousUpdatedAt) {
        data.value = next
        refreshState.value = { phase: 'complete' }
        return
      }
    }
    refreshState.value = { phase: 'failed', error: '刷新已完成排队，但 Vercel 发布超时，请稍后重新打开页面' }
  }

  function sourceArticleCount(id) {
    return data.value.items.filter((item) => item.sources.some((source) => source.id === id)).length
  }

  onMounted(async () => {
    syncUrl()
    router.onAfterRouteChange = afterRouteChange
    window.addEventListener('popstate', syncUrl)
    saved.value = new Set(JSON.parse(localStorage.getItem('ai-news-saved') ?? '[]'))
    hidden.value = new Set(JSON.parse(localStorage.getItem('ai-news-hidden') ?? '[]'))
    await loadData()
    if (!disposed && isLocalHost()) await pollRefresh()
  })

  onUnmounted(() => {
    disposed = true
    clearTimeout(pollTimer)
    window.removeEventListener('popstate', syncUrl)
    if (router.onAfterRouteChange === afterRouteChange) router.onAfterRouteChange = previousAfterRouteChange
  })

  const desk = {
    data, filters, saved, hidden, loadError, refreshState, isRefreshing,
    refresh, setQuery, sourceArticleCount,
    toggleSaved: (id) => toggle(saved, id),
    toggleHidden: (id) => toggle(hidden, id)
  }
  provide(DeskKey, desk)
  return desk
}

export function useDesk() {
  return inject(DeskKey)
}
