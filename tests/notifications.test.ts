// Run with: npx tsx tests/notifications.test.ts
import { buildNotifications, visibleNotifications, badgeLabel, topSeverity } from "../src/lib/notifications";
const eq = (a:any,b:any,m:string)=>{ const ok=JSON.stringify(a)===JSON.stringify(b); console.log(ok?"PASS":"FAIL", m, ok?"":`got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if(!ok) process.exitCode=1; };
const T = "2026-11-03";
const trip = (id:string,name:string,s:string,e:string|null,status="active")=>({id,name,start_date:s,end_date:e,status});

eq(buildNotifications({passportAlert:null,trips:[],docCounts:{},today:T}), [], "nothing -> empty");

const crit = {level:"critical" as const,title:"Renew your passport now",message:"Short.",expiry:"2027-03-01",tripConflict:null};
const n1 = buildNotifications({passportAlert:crit,trips:[],docCounts:{},today:T});
eq([n1.length,n1[0].severity,n1[0].id], [1,"urgent","passport:2027-03-01:critical"], "critical passport is urgent");
eq(buildNotifications({passportAlert:{...crit,level:"renew"},trips:[],docCounts:{},today:T})[0].severity, "warning", "renew is warning");

const soon = trip("a","Miami","2026-11-10","2026-11-15");
eq(buildNotifications({passportAlert:null,trips:[soon],docCounts:{},today:T})[0].id, "nodocs:a", "upcoming trip without docs");
eq(buildNotifications({passportAlert:null,trips:[soon],docCounts:{a:2},today:T}), [], "has docs -> quiet");
eq(buildNotifications({passportAlert:null,trips:[trip("b","Far","2027-02-01",null)],docCounts:{},today:T}), [], "far trip -> quiet");
eq(buildNotifications({passportAlert:null,trips:[trip("c","Done","2026-11-10","2026-11-12","completed")],docCounts:{},today:T}), [], "completed trip -> quiet");

const e1 = buildNotifications({passportAlert:null,trips:[trip("d","Old","2026-10-01","2026-10-05")],docCounts:{},today:T});
eq([e1.length,e1[0].id,e1[0].href], [1,"ended:d","/trips/d"], "one ended trip");
const e2 = buildNotifications({passportAlert:null,trips:[trip("d","Old","2026-10-01","2026-10-05"),trip("e","Older","2026-09-01",null)],docCounts:{},today:T});
eq([e2.length,e2[0].title,e2[0].href], [1,"2 trips have ended","/trips"], "grouped ended trips");

const all = buildNotifications({passportAlert:crit,trips:[soon,trip("d","Old","2026-10-01","2026-10-05")],docCounts:{},today:T});
eq(all.map(n=>n.severity), ["urgent","info","info"], "sorted by severity");
eq(topSeverity(all), "urgent", "top severity");
eq(topSeverity([]), null, "no severity");

const now = Date.parse("2026-11-03T12:00:00Z");
const dismissed = {"nodocs:a": now - 2*86_400_000, "passport:2027-03-01:critical": now - 1000};
eq(visibleNotifications(all, dismissed, now).map(n=>n.id), ["passport:2027-03-01:critical","ended:d"], "snoozed hidden, urgent stays");
eq(visibleNotifications(all, {"nodocs:a": now - 8*86_400_000}, now).length, 3, "snooze expires after 7 days");
eq([badgeLabel(3), badgeLabel(12)], ["3","9+"], "badge label");
