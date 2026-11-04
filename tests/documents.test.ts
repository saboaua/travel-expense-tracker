// Run with: npx tsx tests/documents.test.ts
import { addMonths, dayDiff, passportStatus, tripPassportCheck, currentPassport, renewalAlert } from "../src/lib/documents";
const eq = (a:any,b:any,m:string)=>{ const ok=JSON.stringify(a)===JSON.stringify(b); console.log(ok?"PASS":"FAIL", m, ok?"":`got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if(!ok) process.exitCode=1; };

eq(addMonths("2026-08-31", 6), "2027-02-28", "clamp to month end");
eq(addMonths("2026-01-15", -9), "2025-04-15", "negative months across year");
eq(addMonths("2024-08-31", 6), "2025-02-28", "leap-year safe");
eq(addMonths("2026-11-03", 12), "2027-11-03", "plain");
eq(dayDiff("2026-11-03", "2026-11-10"), 7, "dayDiff");

const T = "2026-11-03";
eq(passportStatus("2026-10-01", T)!.level, "expired", "expired");
eq(passportStatus("2027-03-01", T)!.level, "critical", "4 months left -> critical");
eq(passportStatus("2027-05-02", T)!.level, "critical", "just under 6 months -> critical");
eq(passportStatus("2027-05-03", T)!.level, "renew", "exactly 6 months is still acceptable");
eq(passportStatus("2027-08-02", T)!.level, "renew", "just under 9 months -> renew");
eq(passportStatus("2027-08-03", T)!.level, "ok", "exactly 9 months -> ok until tomorrow");
eq(passportStatus("2027-08-04", T)!.level, "ok", "over 9 months -> ok");
eq(passportStatus("2030-01-01", T)!.level, "ok", "long validity ok");
eq(passportStatus("garbage", T), null, "bad input");
eq(passportStatus("2027-08-04", T)!.renewBy, "2026-11-04", "renewBy = expiry - 9m");

eq(tripPassportCheck("2027-07-01", "2026-12-20")!.ok, true, "covers trip + 6m");
eq(tripPassportCheck("2027-05-01", "2026-12-20")!.ok, false, "short by");
eq(tripPassportCheck("2027-05-01", "2026-12-20")!.shortByDays, 50, "short by days");
eq(tripPassportCheck("2026-12-01", "2026-12-20")!.expiredBeforeTrip, true, "expires during trip");

eq(currentPassport([{kind:"passport",expiry_date:"2026-01-01"},{kind:"visa",expiry_date:"2030-01-01"},{kind:"passport",expiry_date:"2031-01-01"}])!.expiry_date, "2031-01-01", "latest passport wins");
eq(currentPassport([{kind:"visa",expiry_date:"2030-01-01"}]), null, "no passport");

const trips = [
  {name:"Miami",start_date:"2026-12-10",end_date:"2026-12-20",status:"active"},
  {name:"Old",start_date:"2026-01-01",end_date:"2026-01-05",status:"active"},
  {name:"Done",start_date:"2026-12-01",end_date:"2026-12-03",status:"completed"}];
eq(renewalAlert({expiry_date:"2031-01-01"}, trips, T), null, "all fine -> no alert");
eq(renewalAlert(null, trips, T), null, "no passport -> no alert");
const a = renewalAlert({expiry_date:"2027-05-01"}, trips, T)!;
eq([a.level, a.tripConflict?.tripName], ["critical","Miami"], "critical + conflict");
const b = renewalAlert({expiry_date:"2027-09-01"}, [{name:"Rome",start_date:"2027-03-01",end_date:"2027-03-10",status:"active"}], T)!;
eq([b.level, b.tripConflict?.tripName], ["renew","Rome"], "ok today but too short for later trip");
const c = renewalAlert({expiry_date:"2027-07-01"}, trips, T)!;
eq([c.level, c.tripConflict], ["renew", null], "renew window without trip conflict");
