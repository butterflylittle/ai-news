<script setup>
import { computed } from 'vue'
import { dateKey, formatDate, sourceNames, timeAgo, useDesk } from '../useDesk.js'

const { data, hidden, isRefreshing, refresh } = useDesk()
const availableItems = computed(() => data.value.items.filter((item) => !hidden.value.has(item.id)))
const todayItems = computed(() => availableItems.value.filter((item) => dateKey(item.publishedAt) === data.value.meta.date))
const lead = computed(() => todayItems.value[0] ?? availableItems.value[0])
const secondary = computed(() => {
  const leadId = lead.value?.id
  const todayIds = new Set(todayItems.value.map((item) => item.id))
  return [
    ...todayItems.value,
    ...availableItems.value.filter((item) => !todayIds.has(item.id))
  ].filter((item) => item.id !== leadId).slice(0, 6)
})
const headlineCount = computed(() => data.value.items.filter((item) => item.level === '头条').length)
const livePlatforms = computed(() => new Set(data.value.items.flatMap((item) => item.sources.map((source) => source.platform))).size)
</script>

<template>
  <section class="today-view">
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

    <section v-if="lead" class="lead-grid reveal delay-1">
      <article class="lead-story">
        <div class="story-meta">
          <span class="level-pill">{{ lead.level }}</span>
          <span>{{ lead.category }}</span>
          <span>{{ timeAgo(lead.publishedAt) }}</span>
        </div>
        <a :href="lead.url" :title="lead.titleZh ? lead.title : undefined" target="_blank" rel="noreferrer"><h2>{{ lead.titleZh || lead.title }}</h2></a>
        <p>{{ lead.summaryZh || lead.summary || '该信源没有提供摘要，打开原文查看完整内容。' }}</p>
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
        <a href="/radar">查看全部 <span>↗</span></a>
      </div>
      <div class="brief-grid">
        <article v-for="(item, index) in secondary" :key="item.id" class="brief-card">
          <div class="card-index">0{{ index + 1 }}</div>
          <div class="story-meta"><span>{{ item.category }}</span><span>{{ timeAgo(item.publishedAt) }}</span></div>
          <a :href="item.url" :title="item.titleZh ? item.title : undefined" target="_blank" rel="noreferrer"><h4>{{ item.titleZh || item.title }}</h4></a>
          <p>{{ item.summaryZh || item.summary }}</p>
          <footer><span>{{ item.sources[0]?.name }}</span><strong>{{ item.score }}</strong></footer>
        </article>
      </div>
    </section>
  </section>
</template>
