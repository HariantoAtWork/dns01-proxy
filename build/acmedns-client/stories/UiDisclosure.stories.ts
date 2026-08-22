import type { Meta, StoryObj } from '@storybook/vue3'
import UiDisclosure from '../app/components/Ui/Disclosure.vue'

const meta = {
  title: 'Ui/Disclosure',
  component: UiDisclosure,
  tags: ['autodocs'],
  args: {
    title: 'Apex CNAME example',
    open: false,
  },
} satisfies Meta<typeof UiDisclosure>

export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {
  render: args => ({
    components: { UiDisclosure },
    setup: () => ({ args }),
    template: `
      <UiDisclosure v-bind="args">
        <p class="text-sm text-muted">Drawer body with compact mobile padding.</p>
      </UiDisclosure>
    `,
  }),
}

export const Open: Story = {
  args: { open: true, title: 'Nested challenge CNAMEs' },
  render: args => ({
    components: { UiDisclosure },
    setup: () => ({ args }),
    template: `
      <UiDisclosure v-bind="args">
        <p class="text-sm text-muted">Type a nested path such as <span class="font-mono text-ink">child.parent</span>.</p>
      </UiDisclosure>
    `,
  }),
}
