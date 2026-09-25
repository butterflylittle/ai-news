<script setup>
import { computed, onMounted, ref } from 'vue'

const data = ref({ meta: {}, items: [], sources: [], archive: [] })
const activeView = ref('today')
const activeCategory = ref('全部')
const activePlatform = ref('全部')
const activeSource = ref('全部')
const sourcePlatform = ref('全部')
const query = ref('')
const showHidden = ref(false)
const refreshState = ref({ phase: 'idle' })
const saved = ref(new Set())
const hidden = ref(new Set())
const loadError = ref('')

const views = [
  { id: 'today', label: '今日' },
  { id: 'radar', label: '雷达' },
  { id: 'sources', label: '信源' },
  { id: 'archive', label: '归档' }
]

const platformLabels = {
  official: '官方', developer: '开发者', research: '论文', media: '媒体',
  x: 'X', douyin: '抖音', xiaohongshu: '小红书'
}

const categories = computed(() => ['全部', ...new Set(data.value.items.map((item) => item.category))])
const platforms = computed(() => ['全部', ...new Set(data.value.items.flatMap((item) => item.sources.map((source) => source.platform)))])
const sourcePlatforms = computed(() => ['全部', ...new Set(data.value.sources.map((source) => source.platform))])
const visibleSources = computed(() => data.value.sources.filter((source) => sourcePlatform.value === '全部' || source.platform === sourcePlatform.value))
const sourcesWithArticles = computed(() => data.value.sources.filter((source) => data.value.items.some((item) => item.sources.some((entry) => entry.id === source.id))))
const filteredItems = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return data.value.items.filter((item) => {
    if (!showHidden.value && hidden.value.has(item.id)) return false
    if (activeCategory.value !== '全部' && item.category !== activeCategory.value) return false
    if (activePlatform.value !== '全部' && !item.sources.some((source) => source.platform === activePlatform.value)) return false
    if (activeSource.value !== '全部' && !item.sources.some((source) => source.id === activeSource.value)) return false
    return !needle || `${item.title} ${item.summary} ${item.keywordHits.join(' ')}`.toLowerCase().includes(needle)
  })
})
const todayItems = computed(() => filteredItems.value.filter((item) => dateKey(item.publishedAt) === data.value.meta.date))
const lead = computed(() => todayItems.value[0] ?? filteredItems.value[0])
const secondary = computed(() => {
  const leadId = lead.value?.id
  const todayIds = new Set(todayItems.value.map((item) => item.id))
  return [
    ...todayItems.value,
    ...filteredItems.value.filter((item) => !todayIds.has(item.id))
  ].filter((item) => item.id !== leadId).slice(0, 6)
})
const headlineCount = computed(() => data.value.items.filter((item) => item.level === '头条').length)
const livePlatforms = computed(() => new Set(data.value.items.flatMap((item) => item.sources.map((source) => source.platform))).size)
const isRefreshing = computed(() => ['queued', 'collecting', 'remote'].includes(refreshState.value.phase))
const isLocalHost = () => ['localhost', '127.0.0.1'].includes(window.location.hostname)

function dateKey(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

function formatDate(value, options = {}) {
  if (!value) return '尚未更新'
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', ...options }).format(new Date(value))
}

function timeAgo(value) {
  const diff = Date.now() - new Date(value).valueOf()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
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
  if (isRefreshing.value) setTimeout(pollRefresh, 900)
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
  for (let attempt = 0; attempt < 36; attempt += 1) {
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

function sourceNames(item) {
  return item.sources.map((source) => source.name).join(' · ')
}

function sourceArticleCount(id) {
  return data.value.items.filter((item) => item.sources.some((source) => source.id === id)).length
}

function viewSource(id) {
  activeCategory.value = '全部'
  activePlatform.value = '全部'
  activeSource.value = id
  query.value = ''
  activeView.value = 'radar'
}

function viewPlatform(platform) {
  activeCategory.value = '全部'
  activePlatform.value = platform
  activeSource.value = '全部'
  query.value = ''
  activeView.value = 'radar'
}

onMounted(async () => {
  saved.value = new Set(JSON.parse(localStorage.getItem('ai-news-saved') ?? '[]'))
  hidden.value = new Set(JSON.parse(localStorage.getItem('ai-news-hidden') ?? '[]'))
  await loadData()
  if (isLocalHost()) await pollRefresh()
})
</script>

<template>
  <div class="desk-shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="AI 今日雷达首页">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <span>AI 今日雷达</span>
      </a>

      <nav class="view-tabs" aria-label="主要视图">
        <button v-for="view in views" :key="view.id" :class="{ active: activeView === view.id }" @click="activeView = view.id">
          {{ view.label }}
        </button>
      </nav>

      <button class="refresh-button" :disabled="isRefreshing" @click="refresh">
        <svg :class="{ spinning: isRefreshing }" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.68M20 4v4.68h-4.68"/></svg>
        {{ refreshState.phase === 'remote' ? '等待发布' : isRefreshing ? '正在刷新' : '立即刷新' }}
      </button>
    </header>

    <main>
      <section v-if="activeView === 'today'" class="today-view">
        <div class="masthead reveal">
          <div>
            <p class="eyebrow">MORNING INTELLIGENCE · {{ data.meta.date || '等待首次更新' }}</p>
            <h1>今天，AI 圈<br><em>真正值得看</em>的事。</h1>
          </div>
          <div class="masthead-note">
            <span class="live-dot"></span>
            <p>每天 09:00 自动整理<br>上次更新 {{ formatDate(data.meta.updatedAt) }}</p>
          </div>
        </div>

        <div v-if="loadError || refreshState.phase === 'failed'" class="notice error">
          {{ loadError || `刷新失败：${refreshState.error}` }}
        </div>
        <div v-else-if="refreshState.phase === 'remote'" class="notice info">
          GitHub Actions 已启动，正在等待 Vercel 发布新数据，通常需要 1–3 分钟。
        </div>

        <section v-if="lead" class="lead-grid reveal delay-1">
          <article class="lead-story">
            <div class="story-meta">
              <span class="level-pill">{{ lead.level }}</span>
              <span>{{ lead.category }}</span>
              <span>{{ timeAgo(lead.publishedAt) }}</span>
            </div>
            <a :href="lead.url" target="_blank" rel="noreferrer"><h2>{{ lead.title }}</h2></a>
            <p>{{ lead.summary || '该信源没有提供摘要，打开原文查看完整内容。' }}</p>
            <footer>
              <span>{{ sourceNames(lead) }}</span>
              <div class="score-lockup"><strong>{{ lead.score }}</strong><span>信号分</span></div>
            </footer>
          </article>

          <aside class="signal-panel">
            <p class="panel-kicker">TODAY AT A GLANCE</p>
            <div class="stat-row"><strong>{{ todayItems.length }}</strong><span>今日信号</span></div>
            <div class="stat-row"><strong>{{ headlineCount }}</strong><span>高价值头条</span></div>
            <div class="stat-row"><strong>{{ livePlatforms }}</strong><span>活跃平台</span></div>
            <div class="signal-meter" aria-label="数据源成功率">
              <span :style="{ width: `${data.meta.enabledSources ? data.meta.successfulSources / data.meta.enabledSources * 100 : 0}%` }"></span>
            </div>
            <p class="meter-note">{{ data.meta.successfulSources || 0 }}/{{ data.meta.enabledSources || 0 }} 个数据源读取成功</p>
          </aside>
        </section>

        <section v-else class="empty-radar reveal delay-1">
          <div class="radar-visual" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
          <p class="eyebrow">RADAR IS QUIET</p>
          <h2>还没有采集数据</h2>
          <p>点击“立即刷新”读取已启用的 RSS。抖音和小红书需要先在 <code>config/feeds.json</code> 中完成配置。</p>
          <button class="primary-action" :disabled="isRefreshing" @click="refresh">{{ isRefreshing ? '正在建立信号…' : '开始第一次刷新' }}</button>
        </section>

        <section v-if="secondary.length" class="briefing reveal delay-2">
          <div class="section-heading">
            <div><p class="eyebrow">THE BRIEFING</p><h3>今日简报</h3></div>
            <button @click="activeView = 'radar'">查看全部 <span>↗</span></button>
          </div>
          <div class="brief-grid">
            <article v-for="(item, index) in secondary" :key="item.id" class="brief-card">
              <div class="card-index">0{{ index + 1 }}</div>
              <div class="story-meta"><span>{{ item.category }}</span><span>{{ timeAgo(item.publishedAt) }}</span></div>
              <a :href="item.url" target="_blank" rel="noreferrer"><h4>{{ item.title }}</h4></a>
              <p>{{ item.summary }}</p>
              <footer><span>{{ item.sources[0]?.name }}</span><strong>{{ item.score }}</strong></footer>
            </article>
          </div>
        </section>
      </section>

      <section v-else-if="activeView === 'radar'" class="workspace-view">
        <div class="workspace-head">
          <div><p class="eyebrow">ALL SIGNALS</p><h1>信号雷达</h1></div>
          <label class="search-box">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
            <input v-model="query" type="search" placeholder="搜索模型、公司或关键词" aria-label="搜索信号">
          </label>
        </div>

        <div class="filter-row">
          <div class="filter-group">
            <button v-for="category in categories" :key="category" :class="{ active: activeCategory === category }" @click="activeCategory = category">{{ category }}</button>
          </div>
          <select v-model="activePlatform" aria-label="筛选平台">
            <option v-for="platform in platforms" :key="platform" :value="platform">{{ platformLabels[platform] || platform }}</option>
          </select>
          <select v-model="activeSource" aria-label="筛选信源">
            <option value="全部">全部信源</option>
            <option v-for="source in sourcesWithArticles" :key="source.id" :value="source.id">{{ source.name }}</option>
          </select>
          <label class="hidden-toggle"><input v-model="showHidden" type="checkbox"> 包括隐藏</label>
        </div>

        <div class="radar-list">
          <article v-for="item in filteredItems" :key="item.id" class="radar-item" :class="`level-${item.level}`">
            <div class="score-column"><strong>{{ item.score }}</strong><span>信号分</span></div>
            <div class="radar-copy">
              <div class="story-meta"><span>{{ item.level }}</span><span>{{ item.category }}</span><span>{{ formatDate(item.publishedAt) }}</span></div>
              <a :href="item.url" target="_blank" rel="noreferrer"><h2>{{ item.title }}</h2></a>
              <p>{{ item.summary }}</p>
              <div class="source-chips"><span v-for="source in item.sources" :key="source.id">{{ source.name }}</span></div>
            </div>
            <div class="item-actions">
              <button :class="{ selected: saved.has(item.id) }" :aria-pressed="saved.has(item.id)" :title="saved.has(item.id) ? '取消收藏' : '收藏'" @click="toggle(saved, item.id)">☆</button>
              <button title="隐藏" @click="toggle(hidden, item.id)">×</button>
            </div>
          </article>
          <div v-if="!filteredItems.length" class="empty-list">没有符合当前筛选条件的信号。</div>
        </div>
      </section>

      <section v-else-if="activeView === 'sources'" class="workspace-view">
        <div class="workspace-head"><div><p class="eyebrow">SOURCE HEALTH</p><h1>信源状态</h1></div><p class="head-note">Cookie 与密钥只存在本地服务端。</p></div>
        <div class="source-platform-tabs" aria-label="信源平台分类">
          <button v-for="platform in sourcePlatforms" :key="platform" :class="{ active: sourcePlatform === platform }" :aria-pressed="sourcePlatform === platform" @click="sourcePlatform = platform">
            {{ platformLabels[platform] || platform }}
          </button>
        </div>
        <div class="source-table">
          <div class="table-head"><span>信源 · 已收录文章</span><span>平台</span><span>条目</span><span>延迟</span><span>状态</span></div>
          <div v-for="source in visibleSources" :key="source.id" class="source-row">
            <div>
              <button class="source-link" :disabled="!sourceArticleCount(source.id)" :aria-label="`查看 ${source.name} 的 ${sourceArticleCount(source.id)} 篇文章`" @click="viewSource(source.id)">
                <strong>{{ source.name }}</strong><span v-if="sourceArticleCount(source.id)">{{ sourceArticleCount(source.id) }} 篇文章 ↗</span>
              </button>
              <small>{{ source.note || source.error || source.id }}</small>
            </div>
            <button class="source-platform-link" :aria-label="`查看${platformLabels[source.platform] || source.platform}类文章`" @click="viewPlatform(source.platform)">{{ platformLabels[source.platform] || source.platform }} ↗</button>
            <span>{{ source.count ?? '—' }}</span>
            <span>{{ source.latencyMs ? `${source.latencyMs} ms` : '—' }}</span>
            <span class="status-chip" :class="source.ok === true ? 'ok' : source.ok === false ? 'bad' : 'off'">{{ source.ok === true ? '正常' : source.ok === false ? '异常' : source.pending ? '待配置' : '未启用' }}</span>
          </div>
          <div v-if="!data.sources.length" class="empty-list">首次刷新后会显示每个数据源的健康状态。</div>
        </div>
      </section>

      <section v-else class="workspace-view">
        <div class="workspace-head"><div><p class="eyebrow">DAILY ARCHIVE</p><h1>每日归档</h1></div><p class="head-note">Markdown 文件保存在 <code>data/daily/</code>。</p></div>
        <div class="archive-list">
          <article v-for="entry in data.archive" :key="entry.date">
            <time>{{ entry.date }}</time>
            <div><strong>{{ entry.itemCount }}</strong><span>条信号</span></div>
            <div><strong>{{ entry.headlineIds.length }}</strong><span>条头条</span></div>
            <small>更新于 {{ formatDate(entry.updatedAt) }}</small>
          </article>
          <div v-if="!data.archive.length" class="empty-list">完成第一次刷新后，日报会自动出现在这里。</div>
        </div>
      </section>
    </main>

    <footer class="desk-footer">
      <span>PRIVATE DESK · LOCAL FIRST</span>
      <span>排序透明，没有黑箱判断</span>
    </footer>
  </div>
</template>
