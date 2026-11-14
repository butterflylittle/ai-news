<script setup>
import { computed } from 'vue'
import { formatDate, platformLabels, useDesk } from '../useDesk.js'
import { filterItems, radarHref } from '../filters.mjs'

const { data, filters, hidden, saved, setQuery, toggleHidden, toggleSaved } = useDesk()
const categories = computed(() => [...new Set(['全部', ...data.value.items.map((item) => item.category), filters.value.category])])
const platforms = computed(() => [...new Set(['全部', ...data.value.items.flatMap((item) => item.sources.map((source) => source.platform)), filters.value.platform])])
const sourcesWithArticles = computed(() => data.value.sources.filter((source) => data.value.items.some((item) => item.sources.some((entry) => entry.id === source.id))))
const filteredItems = computed(() => filterItems(data.value.items, filters.value, hidden.value))
const query = computed({ get: () => filters.value.q, set: (q) => setFilters({ q }, true) })

function setFilters(patch, replace = false) {
  setQuery(radarHref({ ...filters.value, ...patch }), replace)
}
</script>

<template>
  <section class="workspace-view">
    <div class="workspace-head">
      <div><p class="eyebrow">ALL SIGNALS</p><h1>信号雷达</h1></div>
      <label class="search-box">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
        <input v-model="query" type="search" placeholder="搜索模型、公司或关键词" aria-label="搜索信号">
      </label>
    </div>

    <div class="filter-row">
      <div class="filter-group">
        <button v-for="category in categories" :key="category" :class="{ active: filters.category === category }" @click="setFilters({ category })" :aria-pressed="filters.category === category">{{ category }}</button>
      </div>
      <select :value="filters.platform" @change="setFilters({ platform: $event.target.value })" aria-label="筛选平台">
        <option v-for="platform in platforms" :key="platform" :value="platform">{{ platformLabels[platform] || platform }}</option>
      </select>
      <select :value="filters.source" @change="setFilters({ source: $event.target.value })" aria-label="筛选信源">
        <option value="全部">全部信源</option>
        <option v-if="filters.source !== '全部' && !sourcesWithArticles.some((source) => source.id === filters.source)" :value="filters.source">{{ filters.source }}</option>
        <option v-for="source in sourcesWithArticles" :key="source.id" :value="source.id">{{ source.name }}</option>
      </select>
      <label class="hidden-toggle"><input :checked="filters.showHidden" @change="setFilters({ showHidden: $event.target.checked })" type="checkbox"> 包括隐藏</label>
    </div>

    <div class="radar-list">
      <article v-for="item in filteredItems" :key="item.id" class="radar-item" :class="`level-${item.level}`">
        <div class="score-column"><strong>{{ item.score }}</strong><span>信号分</span></div>
        <div class="radar-copy">
          <div class="story-meta"><span>{{ item.level }}</span><span>{{ item.category }}</span><span>{{ formatDate(item.publishedAt) }}</span></div>
          <a :href="item.url" :title="item.titleZh ? item.title : undefined" target="_blank" rel="noreferrer"><h2>{{ item.titleZh || item.title }}</h2></a>
          <p>{{ item.summaryZh || item.summary }}</p>
          <div class="source-chips"><span v-for="source in item.sources" :key="source.id">{{ source.name }}</span></div>
        </div>
        <div class="item-actions">
          <button :class="{ selected: saved.has(item.id) }" :aria-pressed="saved.has(item.id)" :title="saved.has(item.id) ? '取消收藏' : '收藏'" @click="toggleSaved(item.id)">☆</button>
          <button :title="hidden.has(item.id) ? '取消隐藏' : '隐藏'" @click="toggleHidden(item.id)">×</button>
        </div>
      </article>
      <div v-if="!filteredItems.length" class="empty-list">没有符合当前筛选条件的信号。</div>
    </div>
  </section>
</template>
