import { parseDocumentText, findDates, guessKind } from "../src/lib/document-text";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const T = "2026-11-06";
const f = (t: string) => { const r = parseDocumentText(t, T); return [r.kind, r.document_number, r.expiry_date, r.issuing_country]; };

/* ---- dates ---- */
eq(findDates("13 MRT /MRT 2028").map((d) => d.iso), ["2028-03-13"], "dates: Dutch month, printed twice");
eq(findDates("Expires 02 Mar 2031 and 5 ene 2030").map((d) => d.iso), ["2031-03-02", "2030-01-05"], "dates: English and Spanish months");
eq(findDates("13/03/2028 and 31.12.2027 and 2029-02-01").map((d) => d.iso), ["2028-03-13", "2027-12-31", "2029-02-01"], "dates: numeric formats, day first");
eq(findDates("03/02/2028", true).map((d) => d.iso), ["2028-03-02"], "dates: month first for US documents");
eq(findDates("31/02/2028 99 XYZ 2028").length, 0, "dates: impossible dates are ignored");
eq(guessKind("RIJBEWIJS DRIVING LICENSE"), "license", "kind: driving license");

/* ---- the Aruba driver's license from the screenshot, as the on-device reader sees it ---- */
const aruba = `RIJBEWIJS ARUBA
DRIVING LICENSE
Number di adm. | Adm. number Number di documento | Document number
354 5642 915 DA0546795
Fam | Surname
Fortin
Nomber | Given names
Patrick Giovanni
Lugar di nacemento | Place of birth Categoria | Category
Aruba BE
Fecha di nacemento | Date of birth
04 SEP /SEP 1977
Fecha di entrega | Date of issue
13 MRT /MRT 2023
Valido te | Date of expiry
13 MRT /MRT 2028
Instancia di entrega | Issuing authority
Ministro di Husticia/Minister of Justice`;
eq(f(aruba), ["license", "DA0546795", "2028-03-13", "Aruba"], "aruba licence: type, document number (not the adm. number), expiry (not issue or birth), country");
const r = parseDocumentText(aruba, T);
eq(JSON.stringify(r).includes("1977") || JSON.stringify(r).includes("354"), false, "aruba licence: no date of birth and no administration number in the result");

// Same card where the reader put the value on the label's own line
eq(f("DRIVING LICENSE\nDocument number DA0546795\nDate of expiry 13 MRT /MRT 2028")[1], "DA0546795", "number on the same line as its label");
// Labels missing, but a future date on a licence is the expiry
eq(f("DRIVING LICENSE ARUBA\n04 SEP 1977\n13 MRT 2023\n13 MRT 2028")[2], "2028-03-13", "no labels: the future date is the expiry");
// No labels and no future date: nothing is guessed
eq(f("DRIVING LICENSE ARUBA\n04 SEP 1977\n13 MRT 2023")[2], null, "no labels, no future date: expiry left empty");

/* ---- other documents ---- */
eq(f("ESTA Travel Authorization\nApplication Number: 12345678\nExpiration Date: 03/02/2028\nUnited States Department of Homeland Security"), ["visa", "12345678", "2028-03-02", "United States"], "ESTA: slash dates are month first");
eq(f("Travel insurance policy\nPolicy number: POL-998877\nValid until 31/12/2027\nNetherlands")[1], "POL998877", "insurance: policy number");
eq(f("Travel insurance policy\nPolicy number: POL-998877\nValid until 31/12/2027\nNetherlands")[2], "2027-12-31", "insurance: valid until");
eq(f("Identity card\nDocument No. 4455667788\nDate of expiry 01 JUN 2030 Colombia"), ["id", "4455667788", "2030-06-01", "Colombia"], "ID card");

/* ---- text that is not a document ---- */
eq(f("WALMART\nTotal 45.20\nThank you\n2026-11-02"), [null, null, null, null], "a receipt gives nothing");
eq(f(""), [null, null, null, null], "empty text gives nothing");

console.log(failed ? `${failed} FAILED` : "all document text checks passed");
process.exit(failed ? 1 : 0);
