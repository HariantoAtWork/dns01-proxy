<script setup lang="ts">
const { summaries, removeSummary, clearSummaries } = useCertBatchSummary()

const clearConfirmOpen = ref(false)

function onClearAll() {
  clearSummaries()
  clearConfirmOpen.value = false
}
</script>

<template>
  <UiPanel v-if="summaries.length">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-sm font-semibold text-ink">Batch summaries</h2>
        <p class="mt-1 text-xs text-muted">
          Saved in this browser after each Apply or renewal batch finishes. Delete any entry or clear the board anytime.
        </p>
      </div>
      <UiButton
        variant="ghost"
        size="sm"
        @click="clearConfirmOpen = true"
      >
        Clear board
      </UiButton>
    </div>

    <div class="mt-3 space-y-2">
      <CertsBatchSummaryDrawer
        v-for="(summary, index) in summaries"
        :key="summary.id"
        :summary="summary"
        :open="index === 0"
        @delete="removeSummary(summary.id)"
      />
    </div>

    <UiConfirmDialog
      v-model:open="clearConfirmOpen"
      title="Clear all batch summaries?"
      confirm-label="Clear board"
      @confirm="onClearAll"
    >
      This removes every saved summary from this browser. Running jobs are not affected.
    </UiConfirmDialog>
  </UiPanel>
</template>
