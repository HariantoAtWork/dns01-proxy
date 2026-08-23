export function filenameFromDisposition(header: string | null, fallback = 'download') {
  const match = header?.match(/filename="?([^";]+)"?/i)
  const name = match?.[1]?.trim()
  return name || fallback
}

export function triggerDownload(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}
