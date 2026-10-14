/** Locale-aware number/date formatting driven by the active i18n locale. */
export function useFormat() {
  const { locale } = useI18n()
  const number = (v: number, opts?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(locale.value, opts).format(v)
  const date = (v: Date | string | number, opts?: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale.value, opts ?? { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(v),
    )
  return { number, date }
}
