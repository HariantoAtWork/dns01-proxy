<script setup lang="ts">
const route = useRoute()

await navigateTo(
  { path: '/domains', query: route.query },
  { replace: true },
)
</script>
