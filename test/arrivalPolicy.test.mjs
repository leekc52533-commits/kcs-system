import test from 'node:test'
import assert from 'node:assert/strict'
import {isArrivalTestMode} from '../server/arrivalPolicy.mjs'

test('Malaysia rollout switches at each local midnight regardless of legacy flag',()=>{
  for(const legacy of ['true','false']) {
    const env={KCS_ARRIVAL_ROLLOUT_SCHEDULE:'2026-10',KCS_REMOTE_ARRIVAL_TEST_MODE:legacy}
    for(const [now,expected] of [
      ['2026-10-02T13:00:00Z',true],
      ['2026-10-04T15:59:59Z',true],
      ['2026-10-04T16:00:00Z',false],
      ['2026-10-05T15:59:59Z',false],
      ['2026-10-05T16:00:00Z',true],
      ['2026-10-15T15:59:59Z',true],
      ['2026-10-15T16:00:00Z',false],
      ['2027-01-01T00:00:00Z',false],
    ]) assert.equal(isArrivalTestMode(env,new Date(now)),expected,now)
  }
})
test('without rollout configuration retains explicit test mode behavior',()=>{
  assert.equal(isArrivalTestMode({}),false)
  assert.equal(isArrivalTestMode({KCS_REMOTE_ARRIVAL_TEST_MODE:'true'}),true)
})
