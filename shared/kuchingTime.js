export const KCS_TIME_ZONE = 'Asia/Kuching'

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: KCS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function kuchingDate(input = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(input)).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function addCalendarDays(date, amount) {
  const [year, month, day] = String(date).split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + Number(amount || 0)))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

export function shortcutForDate(selectedDate, now = new Date()) {
  const today = kuchingDate(now)
  if (selectedDate === today) return 'today'
  if (selectedDate === addCalendarDays(today, 1)) return 'tomorrow'
  if (selectedDate === addCalendarDays(today, 2)) return 'day_after_tomorrow'
  return 'custom'
}

export function kuchingDateLabel(input = new Date(), locale = 'zh-MY') {
  return new Intl.DateTimeFormat(locale, {
    timeZone: KCS_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(input))
}
