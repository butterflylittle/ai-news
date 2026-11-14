<script setup>
import { computed } from 'vue'
import { platformLabels, useDesk } from '../useDesk.js'
import { radarHref, sourcesHref } from '../filters.mjs'

const { data, filters, setQuery, sourceArticleCount } = useDesk()
const sourcePlatforms = computed(() => [...new Set(['全部', ...data.value.sources.map((source) => source.platform), filters.value.platform])])
const visibleSources = computed(() => data.value.sources.filter((source) => filters.value.platform === '全部' || source.platform === filters.value.platform))
</script>

<template>
  <section class="workspace-view">
    <div class="workspace-head"><div><p class="eyebrow">SOURCE HEALTH</p><h1>信源状态</h1></div><p class="head-note">Cookie 与密钥只存在本地服务端。</p></div>
    <div class="source-platform-tabs" aria-label="信源平台分类">
      <button v-for="platform in sourcePlatforms" :key="platform" :class="{ active: filters.platform === platform }" :aria-pressed="filters.platform === platform" @click="setQuery(sourcesHref(platform))">
        {{ platformLabels[platform] || platform }}
      </button>
    </div>
    <div class="source-table">
      <div class="table-head"><span>信源 · 已收录文章</span><span>平台</span><span>条目</span><span>延迟</span><span>状态</span></div>
      <div v-for="source in visibleSources" :key="source.id" class="source-row">
        <div>
          <a class="source-link" :aria-disabled="!sourceArticleCount(source.id)" :href="sourceArticleCount(source.id) ? radarHref({ source: source.id }) : undefined" :aria-label="`查看 ${source.name} 的 ${sourceArticleCount(source.id)} 篇文章`">
            <strong>{{ source.name }}</strong><span v-if="sourceArticleCount(source.id)">{{ sourceArticleCount(source.id) }} 篇文章 ↗</span>
          </a>
          <small>{{ source.note || source.error || source.id }}</small>
        </div>
        <a class="source-platform-link" :aria-label="`查看${platformLabels[source.platform] || source.platform}类文章`" :href="radarHref({ platform: source.platform })">{{ platformLabels[source.platform] || source.platform }} ↗</a>
        <span>{{ source.count ?? '—' }}</span>
        <span>{{ source.latencyMs ? `${source.latencyMs} ms` : '—' }}</span>
        <span class="status-chip" :class="source.ok === true ? 'ok' : source.ok === false ? 'bad' : 'off'">{{ source.ok === true ? '正常' : source.ok === false ? '异常' : source.pending ? '待配置' : '未启用' }}</span>
      </div>
      <div v-if="!data.sources.length" class="empty-list">首次刷新后会显示每个数据源的健康状态。</div>
    </div>
  </section>
</template>
