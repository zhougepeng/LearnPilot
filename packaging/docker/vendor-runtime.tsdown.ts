import { resolve } from 'node:path'
import { defineConfig } from 'tsdown'

const root = resolve(import.meta.dirname, '..', '..')

const shared = {
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
} as const

function vendorRuntime(name: string) {
  return {
    ...shared,
    entry: [resolve(root, 'vendor', name, 'lib', 'types', 'index.js')],
    outDir: resolve(root, 'vendor', name, 'lib'),
  }
}

/**
 * Build vendor packages that use the root workspace config but have no
 * package-local config, so the Web build can resolve their package entries.
 */
export default defineConfig([
  vendorRuntime('cosmokit'),
  vendorRuntime('cordis'),
  vendorRuntime('include'),
  vendorRuntime('group'),
  vendorRuntime('timer'),
  vendorRuntime('hmr'),
])
