import type { Meta, StoryObj } from '@storybook/vue3-vite'
import UiButton from '../app/components/Ui/Button.vue'

const meta = {
  title: 'Ui/Button',
  component: UiButton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['signal', 'ghost', 'danger', 'icon'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
    },
    disabled: { control: 'boolean' },
    to: { control: 'text' },
  },
  args: {
    variant: 'signal',
    size: 'md',
    disabled: false,
  },
} satisfies Meta<typeof UiButton>

export default meta
type Story = StoryObj<typeof meta>

export const Signal: Story = {
  render: args => ({
    components: { UiButton },
    setup: () => ({ args }),
    template: '<UiButton v-bind="args">Save domain</UiButton>',
  }),
}

export const Ghost: Story = {
  args: { variant: 'ghost' },
  render: args => ({
    components: { UiButton },
    setup: () => ({ args }),
    template: '<UiButton v-bind="args">Skip</UiButton>',
  }),
}

export const Danger: Story = {
  args: { variant: 'danger' },
  render: args => ({
    components: { UiButton },
    setup: () => ({ args }),
    template: '<UiButton v-bind="args">Delete</UiButton>',
  }),
}

export const Small: Story = {
  args: { size: 'sm' },
  render: args => ({
    components: { UiButton },
    setup: () => ({ args }),
    template: '<UiButton v-bind="args">Restore</UiButton>',
  }),
}

export const AsLink: Story = {
  args: { variant: 'ghost', to: '/backup' },
  render: args => ({
    components: { UiButton },
    setup: () => ({ args }),
    template: '<UiButton v-bind="args">Open backup</UiButton>',
  }),
}

export const Disabled: Story = {
  args: { disabled: true },
  render: args => ({
    components: { UiButton },
    setup: () => ({ args }),
    template: '<UiButton v-bind="args">Busy…</UiButton>',
  }),
}
