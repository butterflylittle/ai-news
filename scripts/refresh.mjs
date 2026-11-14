import { runPipeline } from './feed.mjs'

const store = await runPipeline({ reason: 'cli' })
console.log(`更新完成：${store.items.length} 条，${store.meta.successfulSources}/${store.meta.enabledSources} 个数据源成功。`)
const translation = store.meta.translation
console.log(`中文翻译：新增 ${translation.translatedFields} 项，复用 ${translation.cachedFields} 项，待重试 ${translation.pendingFields} 项。`)
if (translation.lastError) console.warn(translation.lastError)
