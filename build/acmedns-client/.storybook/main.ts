import type { StorybookConfig } from '@storybook/vue3-vite'
import { mergeConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const rootDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(rootDir, '../app')
const clipboardStub = resolve(rootDir, 'stubs/useClipboardCopy.ts')
const toastsStub = resolve(rootDir, 'stubs/useToasts.ts')

function nuxtComposableStubs(): Plugin {
  return {
    name: 'storybook-nuxt-composable-stubs',
    enforce: 'pre',
    resolveId(id) {
      if (id.includes('composables/useClipboardCopy')) {
        return clipboardStub
      }
      if (id.includes('composables/useToasts')) {
        return toastsStub
      }
    },
  }
}

const config: StorybookConfig = {
  stories: [
    '../stories/**/*.mdx',
    '../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: ['@storybook/addon-docs', '@storybook/addon-mcp'],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  async viteFinal(config) {
    const plugins = (config.plugins ?? []).filter((plugin) => {
      const name = plugin && typeof plugin === 'object' && 'name' in plugin
        ? String(plugin.name)
        : ''
      return !name.includes('storybook:nuxt') && name !== 'builtin:replace'
    })

    return mergeConfig(
      { ...config, plugins },
      {
        server: {
          // Allow LAN / Docker hostnames (preview otherwise 403s and spins forever).
          allowedHosts: true,
        },
        plugins: [
          nuxtComposableStubs(),
          vue(),
          tailwindcss(),
          AutoImport({
            imports: ['vue'],
            dirs: [resolve(appDir, 'composables')],
            vueTemplate: true,
            dts: false,
            ignore: ['useClipboardCopy', 'useToasts'],
          }),
          Components({
            dirs: [resolve(appDir, 'components')],
            directoryAsNamespace: true,
            dts: false,
          }),
        ],
        resolve: {
          alias: [
            { find: '~/', replacement: `${appDir}/` },
            { find: '@/', replacement: `${appDir}/` },
          ],
        },
      },
    )
  },
}

export default config
