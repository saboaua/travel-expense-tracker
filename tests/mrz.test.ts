// Run with: npx tsx tests/mrz.test.ts
import { parseMrz, checkDigit, sanitizeDocumentFields } from "../src/lib/mrz";
const eq = (a:any,b:any,m:string)=>{ const ok=JSON.stringify(a)===JSON.stringify(b); console.log(ok?"PASS":"FAIL", m, ok?"":`got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if(!ok) process.exitCode=1; };

// ICAO 9303 specimen
const L1 = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<";
const L2 = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";
eq(checkDigit("120415"), 9, "check digit expiry");
eq(checkDigit("740812"), 2, "check digit dob");
eq(checkDigit("L898902C3"), 6, "check digit doc number");

const r = parseMrz(`PASSPORT\nSome text\n${L1}\n${L2}\n`)!;
eq([r.kind, r.issuing_country, r.expiry_date, r.holder_name, r.verified], ["passport","Utopia (sample passport)","2012-04-15","Anna Maria Eriksson",true], "specimen passport");
eq(r.document_number, "L898902C3", "document number read and verified");
eq(parseMrz(`${L1}\n${L2.replace("L898902C36","L898902C37")}`)!.document_number, null, "bad number check digit -> number dropped, dates still fine");

// OCR noise: spaces, lowercase, letter-for-digit in the date field
const noisy = parseMrz(`${L1.toLowerCase()}\n${L2.slice(0,21)}12O415${L2.slice(27)}`.replace("12O415","12O4159".slice(0,6)))!;
eq(noisy?.expiry_date, "2012-04-15", "O read instead of 0 still verifies");
eq(parseMrz(`${L1}\n${L2.replace("1204159","1204158")}`), null, "wrong check digit is rejected");
eq(parseMrz("just some random receipt text\nTOTAL 12.50"), null, "no MRZ");
eq(parseMrz(L2), null, "second line alone is not enough");

// Aruba passport (Netherlands-style layout): issuing code ABW
const A1 = "P<ABWDEJONG<<PETER<JAN<<<<<<<<<<<<<<<<<<<<<<";
const body = "NX1234563ABW8001019M3109301";
const fixed = body.slice(0,9) + checkDigit(body.slice(0,9)) + body.slice(10);
const exp = "310930"; const line2 = (fixed.slice(0,10)+"ABW"+"800101"+checkDigit("800101")+"M"+exp+checkDigit(exp)+"<<<<<<<<<<<<<<"+"0"+"0").slice(0,44);
const aw = parseMrz(`${A1}\n${line2}`)!;
eq(aw?.document_number, "NX1234563", "Aruba passport number");
eq([aw?.issuing_country, aw?.expiry_date, aw?.holder_name], ["Aruba","2031-09-30","Peter Jan Dejong"], "Aruba passport (MRZ has no spaces inside surnames)");

// sanitize
const today = "2026-11-03";
eq(sanitizeDocumentFields({kind:"passport",issuing_country:" Aruba ",expiry_date:"2031-09-30",holder_name:"Peter <b>"}, today), {kind:"passport",document_number:null,issuing_country:"Aruba",expiry_date:"2031-09-30",holder_name:"Peter b"}, "sanitize ok + strips angle brackets");
eq(sanitizeDocumentFields({kind:"drivers",expiry_date:"2031-02-30"}, today), {kind:null,document_number:null,issuing_country:null,expiry_date:null,holder_name:null}, "unknown kind, impossible date dropped");
eq(sanitizeDocumentFields({document_number:" nx 1234-563 "}, today).document_number, "NX1234563", "number normalised");
eq(sanitizeDocumentFields({document_number:"<script>"}, today).document_number, null, "odd number rejected");
eq(sanitizeDocumentFields({expiry_date:"1985-01-01"}, today).expiry_date, null, "too old date dropped");
eq(sanitizeDocumentFields({expiry_date:"2099-01-01"}, today).expiry_date, null, "too far future dropped");
eq(sanitizeDocumentFields({holder_name:"x".repeat(200)}, today).holder_name!.length, 80, "name capped");
