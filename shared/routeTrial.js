export const ROUTE_TRIAL_START='2026-09-10'
export const ROUTE_TRIAL_END='2026-09-23'
export const isRouteTrialDate=date=>typeof date==='string'&&date>=ROUTE_TRIAL_START&&date<=ROUTE_TRIAL_END
