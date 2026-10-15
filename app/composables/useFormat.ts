/** Locale-aware number/date formatting driven by the active i18n locale. */
export function useFormat() {
  const { locale } = useI18n()
  const number = (v: number, opts?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(locale.value, opts).format(v)
  const date = (v: Date | string | number, opts?: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale.value, opts ?? { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(v),
    )
  /** "3 minutes ago" / "há 3 minutos", in whole minutes (0 reads as "this minute"). */
  const minutesAgo = (since: number, now: number = Date.now()) =>
    new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }).format(-Math.max(0, Math.floor((now - since) / 60000)), 'minute')
  return { number, date, minutesAgo }
}
