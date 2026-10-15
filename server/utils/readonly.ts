/** `DBLOCAL_READONLY=1` makes every connection read-only (the `--readonly` flag of the CLI sets it). */
export function globalReadonly(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.DBLOCAL_READONLY?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}
