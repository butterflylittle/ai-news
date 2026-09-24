import { copyFile, mkdir } from 'node:fs/promises'

await mkdir('docs/public/data', { recursive: true })
await copyFile('data/store.json', 'docs/public/data/store.json')
