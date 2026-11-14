import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { resolveStaticFile } from '../server/static.mjs'

test('serves independent HTML pages for clean URLs and direct refreshes', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-news-routes-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'data'))
  await mkdir(path.join(root, 'nested'))
  for (const file of ['index.html', 'radar.html', 'sources.html', 'archive.html', '404.html', 'data/store.json', 'nested/index.html']) {
    await writeFile(path.join(root, file), file)
  }
  for (const [url, file] of [
    ['/', 'index.html'], ['/radar', 'radar.html'], ['/sources', 'sources.html'], ['/archive', 'archive.html'],
    ['/radar.html', 'radar.html'], ['/radar/', 'radar.html'], ['/data/store.json', 'data/store.json'], ['/nested/', 'nested/index.html']
  ]) {
    assert.deepEqual(await resolveStaticFile(root, url), { file: path.join(root, file), status: 200 }, url)
  }
  assert.deepEqual(await resolveStaticFile(root, '/missing'), { file: path.join(root, '404.html'), status: 404 })
  assert.deepEqual(await resolveStaticFile(root, '/assets/missing.js'), { file: path.join(root, '404.html'), status: 404 })
  assert.equal((await resolveStaticFile(root, '/%2e%2e/secret')).status, 403)
  assert.equal((await resolveStaticFile(root, '/%invalid')).status, 400)
})
