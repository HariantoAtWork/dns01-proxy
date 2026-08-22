import type { Meta, StoryObj } from '@storybook/vue3'
import { ref } from 'vue'
import UiPasswordInput from '../app/components/Ui/PasswordInput.vue'
import UiField from '../app/components/Ui/Field.vue'

const meta = {
  title: 'Ui/PasswordInput',
  component: UiPasswordInput,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Editable password field with an in-field eye toggle (no copy button).',
      },
    },
  },
} satisfies Meta<typeof UiPasswordInput>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => ({
    components: { UiPasswordInput, UiField },
    setup() {
      const password = ref('hunter2-example')
      return { password }
    },
    template: `
      <UiField label="Password" for="story-password">
        <UiPasswordInput id="story-password" v-model="password" />
      </UiField>
    `,
  }),
}

export const Invalid: Story = {
  render: () => ({
    components: { UiPasswordInput, UiField },
    setup() {
      const password = ref('wrong')
      return { password }
    },
    template: `
      <UiField label="Password" error="Wrong username or password" for="story-password-invalid">
        <UiPasswordInput id="story-password-invalid" v-model="password" invalid />
      </UiField>
    `,
  }),
}
