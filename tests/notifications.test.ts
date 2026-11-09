// Run with: npx tsx tests/notifications.test.ts
import { buildAccessNotification, buildNotifications, buildSecurityNotifications, visibleNotifications, badgeLabel, topSeverity } from "../src/lib/notifications";
const eq = (a:unknown,b:unknown,m:string)=>{ const ok=JSON.stringify(a)===JSON.stringify(b); console.log(ok?"PASS":"FAIL", m, ok?"":`got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if(!ok) process.exitCode=1; };
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

// ---- security alerts (admin) ----
const NOW = Date.parse("2026-11-03T20:00:00Z");
const ev = (t:string,s:string,iso:string)=>({event_type:t,severity:s,created_at:iso});
eq(buildSecurityNotifications([], NOW), [], "no events");
eq(buildSecurityNotifications([ev("login_success","info","2026-11-03T19:00:00Z"),ev("logout","info","2026-11-03T19:10:00Z")], NOW), [], "info events ignored");
eq(buildSecurityNotifications([ev("brute_force","warning","2026-10-02T19:00:00Z")], NOW), [], "older than 24h ignored");
const sec = buildSecurityNotifications([
  ev("brute_force","critical","2026-11-03T19:30:00Z"), ev("brute_force","critical","2026-11-03T19:50:00Z"),
  ev("suspicious_input","warning","2026-11-03T18:00:00Z"), ev("access_denied","warning","2026-11-03T10:00:00Z"), ev("access_denied","warning","2026-11-03T11:00:00Z"), ev("access_denied","warning","2026-11-03T12:00:00Z"),
  ev("rate_limit","warning","2026-11-03T09:00:00Z")], NOW);
eq(sec.length, 3, "capped at 3");
eq([sec[0].severity, sec[0].title], ["urgent","Security alert: Brute force attack detected"], "brute force first and urgent");
eq(sec[0].message, "2 events in the last 24 hours. Latest 10 min ago.", "message with count and age");
eq(sec[0].id, "security:brute_force:2026-11-03T19:50:00Z", "id carries latest event time");
eq(sec[1].title, "Access denied attempts", "more events ranks higher within warnings");
eq(sec.every(n=>n.href==="/admin/security" && n.dismissible===true), true, "links to security, dismissible");
eq(JSON.stringify(sec).includes("@"), false, "no emails leak into the bell");
eq(visibleNotifications(sec, {[sec[0].id]: NOW - 1000}, NOW).length, 2, "security alert can be dismissed");
eq(visibleNotifications(sec, {"security:brute_force:2026-11-03T19:00:00Z": NOW - 1000}, NOW).length, 3, "new event re-alerts");
eq(buildSecurityNotifications([ev("login_failed","warning","2026-11-03T19:00:00Z"),ev("login_failed","warning","2026-11-03T19:05:00Z")], NOW), [], "a couple of failed logins is not an alert");
eq(buildSecurityNotifications(Array.from({length:5},(_,i)=>ev("login_failed","warning",`2026-11-03T19:0${i}:00Z`)), NOW)[0].title, "Failed logins", "5 failed logins is an alert");
eq(buildSecurityNotifications([ev("login_blocked","critical","2026-11-03T19:00:00Z")], NOW)[0].title, "Security alert: Logins blocked by lockout", "lockout is a critical alert");

// ---- new options to assign (admin) ----
eq(buildAccessNotification([]), [], "no roles");
eq(buildAccessNotification([{key:"user",known_features:["trips","reports","personal","personal.dashboard","documents","loyalty","users.manage","security.view","categories.manage","currencies.manage","branding.manage","telegram.manage","support.view","sharing","help.manage","subscriptions","iptv.mine"]},{key:"admin",known_features:[]}]), [], "everything reviewed -> quiet (admin never counts)");
const nn = buildAccessNotification([{key:"sales",label:"Sales",known_features:["trips"]}]);
eq([nn.length, nn[0].href, nn[0].title], [1,"/admin/users?tab=roles","16 new options to assign"], "unreviewed options flagged");
eq(buildAccessNotification([{key:"sales",known_features:["trips","reports","personal","personal.dashboard","documents","loyalty","users.manage","security.view","categories.manage","currencies.manage","branding.manage","telegram.manage","sharing","help.manage","subscriptions","iptv.mine"]}])[0].message, "Support requests. Choose which roles can use it.", "single new option wording");
