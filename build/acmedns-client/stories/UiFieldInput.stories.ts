import type { Meta, StoryObj } from '@storybook/vue3'
import { ref } from 'vue'
import UiField from '../app/components/Ui/Field.vue'
import UiInput from '../app/components/Ui/Input.vue'

const meta = {
  title: 'Ui/Field + Input',
  component: UiField,
  tags: ['autodocs'],
} satisfies Meta<typeof UiField>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => ({
    components: { UiField, UiInput },
    setup() {
      const value = ref('example.com')
      return { value }
    },
    template: `
      <UiField label="Domain" for="story-domain">
        <UiInput id="story-domain" v-model="value" placeholder="example.com" />
      </UiField>
    `,
  }),
}

export const WithHint: Story = {
  render: () => ({
    components: { UiField, UiInput },
    setup() {
      const value = ref('http://acmedns-server')
      return { value }
    },
    template: `
      <UiField label="Server URL" hint="Must be reachable from Certbot" for="story-server">
        <UiInput id="story-server" v-model="value" mono />
      </UiField>
    `,
  }),
}

export const WithError: Story = {
  render: () => ({
    components: { UiField, UiInput },
    setup() {
      const value = ref('not a domain')
      return { value }
    },
    template: `
      <UiField label="Domain" error="Invalid domain format" for="story-domain-error">
        <UiInput id="story-domain-error" v-model="value" invalid />
      </UiField>
    `,
  }),
}
