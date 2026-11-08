// Run with: npx tsx tests/passport-balloon.test.ts
// The passport banner is red only when it needs action now; amber while there is time.
import { balloonTone } from "../src/components/documents/PassportBalloon";

const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };
const today = "2026-11-08";
eq(balloonTone({ level: "expired", expiry: "2026-10-01", tripConflict: null }, today), "urgent", "expired is red");
eq(balloonTone({ level: "critical", expiry: "2027-04-07", tripConflict: null }, today), "soon", "five months left is amber");
eq(balloonTone({ level: "critical", expiry: "2027-01-20", tripConflict: null }, today), "urgent", "under 90 days is red");
eq(balloonTone({ level: "critical", expiry: "2027-04-07", tripConflict: { tripName: "Miami", mustBeValidUntil: "2027-05-10" } }, today), "urgent", "a passport that blocks a booked trip is red");
