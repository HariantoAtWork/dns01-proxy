import type { Meta, StoryObj } from '@storybook/vue3'
import UiSecretField from '../app/components/Ui/SecretField.vue'

const meta = {
  title: 'Ui/SecretField',
  component: UiSecretField,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Readonly secret/value field with an embedded eye (when secret) and copy control.',
      },
    },
  },
  argTypes: {
    secret: { control: 'boolean' },
    label: { control: 'text' },
    value: { control: 'text' },
    hint: { control: 'text' },
  },
} satisfies Meta<typeof UiSecretField>

export default meta
type Story = StoryObj<typeof meta>

export const Password: Story = {
  args: {
    label: 'Password',
    value: 's3cret-acme-dns-password',
    secret: true,
  },
}

export const Username: Story = {
  args: {
    label: 'Username',
    value: '87eb4f67-8cbb-4477-805d-4c2c6ca0caa3',
    secret: true,
  },
}

export const PlainCopyable: Story = {
  args: {
    label: 'Full domain',
    value: '87eb4f67-8cbb-4477-805d-4c2c6ca0caa3.auth.example.com',
    secret: false,
    hint: 'CNAME target',
  },
}
