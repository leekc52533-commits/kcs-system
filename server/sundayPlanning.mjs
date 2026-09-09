export const SUNDAY_GROUPS=[{routeNumber:4,members:[4,1],name:'Serian A + Serian Penrissen'},{routeNumber:2,members:[2,5],name:'Kuching MPKS + Bau/Lundu'}]
export const isSunday=date=>new Date(`${date}T00:00:00Z`).getUTCDay()===0
export const sundayGroup=route=>SUNDAY_GROUPS.find(g=>g.members.includes(Number(route)))
// A calendar anchor, independent of refreshes and one-day supervisor changes.
export const sundayDutyRoute=(date,group)=>group.members[((Math.floor((Date.parse(date+'T00:00:00Z')-Date.parse('2026-09-13T00:00:00Z'))/604800000)%2)+2)%2]
export const sundaySettings=(db,branchId)=>db.prepare('SELECT home_route_number homeRouteNumber,sunday_route_number sundayRouteNumber,sunday_confirmed sundayConfirmed,effective_date effectiveDate FROM branch_sunday_settings WHERE branch_id=?').get(branchId)||{}
export function executionRoute(db,branchId,date,fallback){
 if(!isSunday(date))return fallback
 const stored=sundaySettings(db,branchId),setting=stored.effectiveDate&&date<stored.effectiveDate?{}:stored,route=setting.sundayRouteNumber||setting.homeRouteNumber||fallback
 return sundayGroup(route)?.routeNumber||route
}
export const sundaySchemaSql=`
CREATE TABLE IF NOT EXISTS branch_sunday_settings (
 branch_id INTEGER PRIMARY KEY REFERENCES branches(id),
 home_route_number INTEGER CHECK(home_route_number BETWEEN 1 AND 5),
 sunday_route_number INTEGER CHECK(sunday_route_number BETWEEN 1 AND 5),
 sunday_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(sunday_confirmed IN(0,1)),
 effective_date TEXT, updated_by TEXT NOT NULL, reason TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sunday_dispatch_setup (
 dispatch_day_id INTEGER PRIMARY KEY REFERENCES dispatch_days(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`
