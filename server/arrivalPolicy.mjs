import {kuchingDate} from '../shared/kuchingTime.js'

// Evaluate per request, including across midnight without restarting the API.
export function isArrivalTestMode(env=process.env, now=new Date()) {
  if (env.KCS_ARRIVAL_ROLLOUT_SCHEDULE === '2026-10') {
    const date=kuchingDate(now)
    // The rollout takes precedence over the legacy permanent test-mode flag.
    return date !== '2026-10-05' && date < '2026-10-16'
  }
  return /^(1|true|yes|on)$/i.test(String(env.KCS_REMOTE_ARRIVAL_TEST_MODE||'').trim())
}
