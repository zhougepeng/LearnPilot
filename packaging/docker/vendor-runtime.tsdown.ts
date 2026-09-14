import { defineConfig } from 'tsdown'
import { resolve } from 'node:path'

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
    entry: [resolve(import.meta.dirname, '..', '..', 'vendor', name, 'lib', 'types', 'index.js')],
    outDir: resolve(import.meta.dirname, '..', '..', 'vendor', name, 'lib'),
  }
}

/**
 * Build vendor packages that deliberately use the root workspace tsdown config
 * but have no package-local config. A fresh checkout has their TypeScript
 * output after build:lib but not their package entry points for Vite.
 */
export default defineConfig([
  vendorRuntime('cosmokit'),
  vendorRuntime('cordis'),
  vendorRuntime('include'),
  vendorRuntime('group'),
  vendorRuntime('timer'),
  vendorRuntime('hmr'),
])
