import { cpSync, existsSync, globSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const directories = globSync('packages/*/*/package.json', { cwd: root })
  .sort()
  .map(manifestPath => {
    const directory = dirname(manifestPath)
    const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'))
    if (manifest.main !== 'lib/index.js') return undefined
    if (existsSync(resolve(root, directory, 'tsdown.config.ts'))) return undefined
    if (existsSync(resolve(root, directory, 'tsdown.client.ts'))) return undefined
    if (!existsSync(resolve(root, directory, 'lib', 'types', 'index.js'))) return undefined
    return directory
  })
  .filter(directory => directory !== undefined)

for (const directory of directories) {
  cpSync(resolve(root, directory, 'lib', 'types'), resolve(root, directory, 'lib'), {
    force: true,
    recursive: true,
  })
}

console.log(`materialized ${directories.length} plain workspace runtime package(s)`)
