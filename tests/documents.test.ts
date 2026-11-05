// Run with: npx tsx tests/documents.test.ts
import { formatBytes, isCroppable } from "../src/lib/document-upload";
import { fileKind, maskNumber, addMonths, dayDiff, passportStatus, tripPassportCheck, currentPassport, renewalAlert } from "../src/lib/documents";
const eq = (a:unknown,b:unknown,m:string)=>{ const ok=JSON.stringify(a)===JSON.stringify(b); console.log(ok?"PASS":"FAIL", m, ok?"":`got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if(!ok) process.exitCode=1; };

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
eq([maskNumber("NX1234563"), maskNumber("AB1")], ["••••4563","••••"], "mask number");

eq(fileKind("u/general/abc-passport.PDF"), "pdf", "pdf kind");
eq(fileKind("u/t/abc-photo.jpg"), "image", "jpg kind");
eq(fileKind("u/t/abc-photo.webp"), "image", "webp kind");
eq(fileKind("u/t/abc-photo.heic"), "other", "heic cannot be shown inline");
eq(fileKind(null), "other", "null kind");

eq(formatBytes(500), "500 B", "bytes");
eq(formatBytes(2048), "2 KB", "kb");
eq(formatBytes(3.2 * 1024 * 1024), "3.2 MB", "mb");
eq(isCroppable({ type: "image/jpeg" }), true, "jpeg croppable");
eq(isCroppable({ type: "image/heic" }), false, "heic not croppable");
eq(isCroppable({ type: "application/pdf" }), false, "pdf not croppable");
import { scanFailureMessage } from "../src/lib/document-extract";
eq(/GEMINI_API_KEY/.test(scanFailureMessage("not_configured")), true, "reason: key missing");
eq(/\(401\)/.test(scanFailureMessage("ai_failed_401")), true, "reason: upstream status shown");
eq(/Too many/.test(scanFailureMessage("limit")), true, "reason: limit");
eq(/network/.test(scanFailureMessage("network")), true, "reason: network");
eq(/Could not read/.test(scanFailureMessage(undefined)), true, "reason: default");
import { documentStatus, sortForTiles } from "../src/lib/documents";
eq(documentStatus("passport", "2031-03-14", "2026-11-05").level, "ok", "tile: passport far from expiry is valid");
eq(documentStatus("passport", "2027-02-02", "2026-11-05").label, "Renew now", "tile: passport inside 6 months = renew now");
eq(documentStatus("passport", "2027-06-01", "2026-11-05").label, "Renew soon", "tile: passport inside 9 months = renew soon");
eq(documentStatus("passport", "2026-10-01", "2026-11-05").level, "expired", "tile: expired passport");
eq(documentStatus("visa", "2027-02-02", "2026-11-05").level, "ok", "tile: visa 90 days out is valid");
eq(documentStatus("visa", "2026-12-20", "2026-11-05").label, "Expires soon", "tile: visa within 60 days");
eq(documentStatus("insurance", "2026-11-05", "2026-11-05").level, "soon", "tile: expires today is still valid, but soon");
eq(documentStatus("ticket", null, "2026-11-05").level, "none", "tile: no expiry, no status");
eq(sortForTiles([{ expiry_date: null, created_at: "2026-01-01" }, { expiry_date: "2031-01-01" }, { expiry_date: "2026-12-01" }]).map((d) => d.expiry_date), ["2026-12-01", "2031-01-01", null], "tile order");
