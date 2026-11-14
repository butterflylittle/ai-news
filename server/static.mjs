import path from 'node:path'
import { stat } from 'node:fs/promises'

export async function resolveStaticFile(root, pathname) {
  let requested
  try {
    requested = decodeURIComponent(pathname)
  } catch {
    return { file: null, status: 400 }
  }
  const file = path.resolve(root, `.${requested}`)
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return { file: null, status: 403 }
  const candidates = path.extname(file) ? [file] : [file, `${file}.html`, path.join(file, 'index.html')]
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return { file: candidate, status: 200 }
    } catch {
      // Try the next static HTML representation.
    }
  }
  return { file: path.join(root, '404.html'), status: 404 }
}
