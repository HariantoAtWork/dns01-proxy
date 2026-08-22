import type { Preview } from '@storybook/vue3'
import '../app/assets/css/main.css'

const preview: Preview = {
  parameters: {
    layout: 'centered',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      toc: true,
    },
  },
  decorators: [
    () => ({
      template: '<div class="min-w-[20rem] max-w-[40rem] bg-paper p-4 text-ink"><story /></div>',
    }),
  ],
}

export default preview
