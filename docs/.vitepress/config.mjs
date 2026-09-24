import { defineConfig } from 'vitepress'
import { localApiPlugin } from '../../server/vite-plugin.mjs'

export default defineConfig({
  lang: 'zh-CN',
  title: 'AI 今日雷达',
  description: '每天九点，筛出真正值得看的 AI 动向。',
  cleanUrls: true,
  head: [
    ['meta', { name: 'theme-color', content: '#f3f0e8' }],
    ['meta', { name: 'color-scheme', content: 'light' }]
  ],
  vite: {
    plugins: [localApiPlugin()]
  }
})
