<script setup>
import { formatDate, useDesk } from '../useDesk.js'

const { data } = useDesk()
</script>

<template>
  <section class="workspace-view">
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
</template>
