<script setup>
import { computed } from 'vue'
import { useData, useRoute } from 'vitepress'
import { provideDesk } from './useDesk.js'

const { refresh, refreshState, isRefreshing, loadError } = provideDesk()
const { page } = useData()
const route = useRoute()
const activePath = computed(() => route.path.replace(/\.html$/, '').replace(/\/$/, '') || '/')
const views = [
  { href: '/', label: '今日' },
  { href: '/radar', label: '雷达' },
  { href: '/sources', label: '信源' },
  { href: '/archive', label: '归档' }
]
</script>

<template>
  <div class="desk-shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="AI 今日雷达首页">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <span>AI 今日雷达</span>
      </a>

      <nav class="view-tabs" aria-label="主要视图">
        <a v-for="view in views" :key="view.href" :href="view.href" :class="{ active: activePath === view.href }" :aria-current="activePath === view.href ? 'page' : undefined">
          {{ view.label }}
        </a>
      </nav>

      <button class="refresh-button" :disabled="isRefreshing" @click="refresh">
        <svg :class="{ spinning: isRefreshing }" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.68M20 4v4.68h-4.68"/></svg>
        {{ refreshState.phase === 'remote' ? '等待发布' : isRefreshing ? '正在刷新' : '立即刷新' }}
      </button>
    </header>

    <main>
      <div v-if="loadError || refreshState.phase === 'failed'" class="notice desk-notice error" role="alert">
        {{ loadError || `刷新失败：${refreshState.error}` }}
      </div>
      <div v-else-if="refreshState.phase === 'remote'" class="notice desk-notice info" role="status">
        GitHub Actions 已启动，正在等待 Vercel 发布新数据，通常需要 1–3 分钟。
      </div>

      <section v-if="page.isNotFound" class="workspace-view">
        <div class="workspace-head"><h1>未找到页面</h1></div>
        <a class="primary-action" href="/">返回今日</a>
      </section>
      <Content v-else />
    </main>

    <footer class="desk-footer">
      <span>PRIVATE DESK · LOCAL FIRST</span>
      <span>排序透明，没有黑箱判断</span>
    </footer>
  </div>
</template>
