/** POSTs a body and saves the response as a file. Used by the exports (the server streams them). */
export async function downloadFrom(url: string, body: Record<string, unknown>, filename: string): Promise<void> {
  const blob = await $fetch<Blob>(url, { method: 'POST', body, responseType: 'blob' })
  saveBlob(blob, filename)
}

export function saveBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
  URL.revokeObjectURL(href)
}
