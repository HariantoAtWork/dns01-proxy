<script setup lang="ts">
import { domainsPath } from '#shared/utils/domainsRoute'

const route = useRoute()
const domain = String(route.params.domain || '')

await navigateTo(domainsPath(domain || undefined), { replace: true })
</script>
