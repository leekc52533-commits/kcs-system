export const REQUIRED_STEPS = [
  { id: 'gps', label: 'GPS 到达验证' },
  { id: 'jodooSync', label: 'Jodoo 作业资料同步' },
  { id: 'invoicePhoto', label: '账单／单据照片' },
  { id: 'sitePhoto', label: '现场照片' },
  { id: 'paymentProof', label: '付款证明' },
]

export const NO_COLLECTION_STEPS = [
  { id: 'noCollectionDetails', label: '无收货原因' },
  { id: 'noCollectionEvidence', label: '无收货证据' },
]

export function requiredStepsForStop(stop) {
  if (stop.outcome !== 'no_collection') return REQUIRED_STEPS
  return stop.noCollectionTiming === 'before_arrival'
    ? NO_COLLECTION_STEPS
    : [REQUIRED_STEPS[0], ...NO_COLLECTION_STEPS]
}

export function completedStepCount(stop) {
  return requiredStepsForStop(stop).filter((step) => Boolean(stop.steps[step.id])).length
}

export function canCompleteStop(stop) {
  return completedStepCount(stop) === requiredStepsForStop(stop).length
}

export function isStopFinished(stop) {
  return stop.status === 'completed' || stop.status === 'overridden'
}

export function isStopDeferred(stop) {
  return stop.status === 'deferred'
}

export function isStopUnlocked(stops, index) {
  if (index === 0) return true
  return stops.slice(0, index).every((stop) => isStopFinished(stop) || isStopDeferred(stop))
}

export function firstAvailableStopIndex(stops) {
  const nextRegularStop = stops.findIndex((stop, stopIndex) => isStopUnlocked(stops, stopIndex) && !isStopFinished(stop) && !isStopDeferred(stop))
  if (nextRegularStop !== -1) return nextRegularStop
  const deferredStop = stops.findIndex((stop, stopIndex) => isStopUnlocked(stops, stopIndex) && isStopDeferred(stop))
  return deferredStop === -1 ? Math.max(0, stops.length - 1) : deferredStop
}
