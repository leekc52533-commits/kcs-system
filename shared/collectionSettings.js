export const COLLECTION_FREQUENCIES = [
  'Once a week',
  'Twice a week',
  '3 times a week',
  '4 times a week',
  '6 times a week',
  'Daily',
  'Every 2 Weeks',
  'Every 3 Weeks',
  'Monthly',
  'On Call',
  'Paused',
]

export const COLLECTION_WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

export const EXPECTED_COLLECTION_DAYS = {
  'Once a week': 1,
  'Twice a week': 2,
  '3 times a week': 3,
  '4 times a week': 4,
  '6 times a week': 6,
  Daily: 7,
  'Every 2 Weeks': 1,
  'Every 3 Weeks': 1,
  Monthly: 1,
}

const frequencyAliases = new Map([
  ['weekly', 'Once a week'],
  ['once weekly', 'Once a week'],
  ['once per week', 'Once a week'],
  ['1 time a week', 'Once a week'],
  ['1 times a week', 'Once a week'],
  ['1 time per week', 'Once a week'],
  ['twice weekly', 'Twice a week'],
  ['twice per week', 'Twice a week'],
  ['2 times a week', 'Twice a week'],
  ['2 times per week', 'Twice a week'],
  ['three times a week', '3 times a week'],
  ['3 times per week', '3 times a week'],
  ['four times a week', '4 times a week'],
  ['4 times per week', '4 times a week'],
  ['six times a week', '6 times a week'],
  ['6 times per week', '6 times a week'],
  ['every day', 'Daily'],
  ['everyday', 'Daily'],
  ['2 weeks', 'Every 2 Weeks'],
  ['biweekly', 'Every 2 Weeks'],
  ['fortnightly', 'Every 2 Weeks'],
  ['3 weeks', 'Every 3 Weeks'],
  ['on-call', 'On Call'],
  ['on demand', 'On Call'],
  ['as requested', 'On Call'],
  ['pause', 'Paused'],
])

const emptyFrequencyValues = new Set(['', 'null', 'undefined', 'n/a', 'na', '-', 'not set', 'unset'])
const clean = value => String(value ?? '').trim()
const comparable = value => clean(value).toLowerCase().replace(/\s+/g, ' ')

export function normalizeCollectionFrequency(value, {strict = true} = {}) {
  const raw = clean(value)
  const key = comparable(raw)
  if (emptyFrequencyValues.has(key)) return null
  const canonical = COLLECTION_FREQUENCIES.find(item => comparable(item) === key)
  if (canonical) return canonical
  const alias = frequencyAliases.get(key)
  if (alias) return alias
  if (!strict) return null
  throw new Error(`Invalid Collection Frequency "${raw}". Allowed values: ${COLLECTION_FREQUENCIES.join(', ')} or blank.`)
}

export function parseCollectionWeekdays(value, {strict = true} = {}) {
  let source
  if (Array.isArray(value)) source = value
  else {
    const raw = clean(value)
    if (!raw) source = []
    else {
      try {
        const parsed = JSON.parse(raw)
        source = Array.isArray(parsed) ? parsed : raw.split(/[,;/]/)
      } catch {
        source = raw.replace(/^\[|\]$/g, '').split(/[,;/]/)
      }
    }
  }
  const normalized = [...new Set(source
    .map(item => clean(item).replaceAll('"', ''))
    .map(item => item === 'Thurday' ? 'Thursday' : item)
    .filter(Boolean))]
  const invalid = normalized.filter(item => !COLLECTION_WEEKDAYS.includes(item))
  if (invalid.length && strict) throw new Error(`Invalid Assigned Weekday "${invalid.join(', ')}".`)
  return COLLECTION_WEEKDAYS.filter(item => normalized.includes(item))
}

export function normalizeCollectionSettings(frequency, weekdays, {strict = true} = {}) {
  const collectionFrequency = normalizeCollectionFrequency(frequency, {strict})
  let assignedWeekdays = parseCollectionWeekdays(weekdays, {strict})
  if (['On Call', 'Paused'].includes(collectionFrequency)) assignedWeekdays = []
  const expected = EXPECTED_COLLECTION_DAYS[collectionFrequency]
  const frequencyWarning = expected && assignedWeekdays.length && assignedWeekdays.length !== expected
    ? `${collectionFrequency} expects ${expected} weekday${expected === 1 ? '' : 's'}, but ${assignedWeekdays.length} selected.`
    : null
  return {
    collectionFrequency,
    assignedWeekdays,
    assignedWeekdaysStorage: assignedWeekdays.length ? JSON.stringify(assignedWeekdays) : null,
    frequencyWarning,
  }
}
