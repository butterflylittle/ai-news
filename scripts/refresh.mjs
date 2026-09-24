import { runPipeline } from './feed.mjs'

const store = await runPipeline({ reason: 'cli' })
console.log(`更新完成：${store.items.length} 条，${store.meta.successfulSources}/${store.meta.enabledSources} 个数据源成功。`)
