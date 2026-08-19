<script setup lang="ts">
const route = useRoute()
const domain = String(route.params.domain || '')

await navigateTo(
  { path: '/', query: domain ? { d: domain } : {} },
  { replace: true },
)
</script>
