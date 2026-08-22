import type { Meta, StoryObj } from '@storybook/vue3-vite'
import UiPanel from '../app/components/Ui/Panel.vue'

const meta = {
  title: 'Ui/Panel',
  component: UiPanel,
  tags: ['autodocs'],
  argTypes: {
    accent: { control: 'boolean' },
    padding: {
      control: 'select',
      options: ['none', 'sm', 'md'],
    },
  },
  args: {
    accent: false,
    padding: 'md',
  },
} satisfies Meta<typeof UiPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: args => ({
    components: { UiPanel },
    setup: () => ({ args }),
    template: `
      <UiPanel v-bind="args">
        <h2 class="text-base font-semibold">CNAME to publish</h2>
        <p class="mt-1 text-sm text-muted">Cloudflare Name and Content for the apex challenge.</p>
      </UiPanel>
    `,
  }),
}

export const Accent: Story = {
  args: { accent: true },
  render: args => ({
    components: { UiPanel },
    setup: () => ({ args }),
    template: `
      <UiPanel v-bind="args">
        <h2 class="text-base font-semibold">Highlighted card</h2>
        <p class="mt-1 text-sm text-muted">Left signal border for primary CNAME blocks.</p>
      </UiPanel>
    `,
  }),
}
