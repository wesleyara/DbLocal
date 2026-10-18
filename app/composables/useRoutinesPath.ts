/** Path of the routines page, optionally with an item selected (`sel`: signature, or `table.trigger`). */
export function routinesPath(connectionId: string, schema: string, sel?: string): string {
  const base = `/c/${connectionId}/${encodeURIComponent(schema)}/routines`
  return sel ? `${base}?sel=${encodeURIComponent(sel)}` : base
}
