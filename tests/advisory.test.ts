import { parseColour, extractPoints, extractEntry, matchAdvisory, updatedDate, stripHtml, destinationParts, type AdvisoryListItem } from "../src/lib/advisory";

let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
}

const list: AdvisoryListItem[] = [
  { location: "Spanje", locationkey: "spanje" },
  { location: "Aruba", locationkey: "aruba" },
  { location: "Panama", locationkey: "panama" },
  { location: "Verenigde Staten", locationkey: "verenigde-staten" },
  { location: "Verenigd Koninkrijk", locationkey: "verenigd-koninkrijk" },
  { location: "Curaçao", locationkey: "curacao" },
  { location: "Sint Maarten", locationkey: "sint-maarten" },
  { location: "Colombia", locationkey: "colombia" },
  { location: "Verenigde Arabische Emiraten", locationkey: "verenigde-arabische-emiraten" },
];
const loc = (d: string) => matchAdvisory(list, d)?.location ?? null;

// colour code
eq("green headline", parseColour("<p>De kleurcode van het reisadvies voor Spanje is groen.</p>"), { level: "green", regional: false });
eq("adjective form", parseColour("Gele kleurcode. Wees voorzichtig."), { level: "yellow", regional: false });
eq("regional mix", parseColour("De kleurcode van het reisadvies voor Colombia is geel. Voor delen geldt een oranje kleurcode en een rode kleurcode."), { level: "yellow", regional: true });
eq("no headline picks worst", parseColour("Oranje kleurcode voor het noorden, groene kleurcode elders"), { level: "orange", regional: true });
eq("empty", parseColour(""), { level: "unknown", regional: false });
eq("no colour text", parseColour("Algemene informatie"), { level: "unknown", regional: false });
eq("null", parseColour(null), { level: "unknown", regional: false });

// bullets
const intro = "<h2>In het kort</h2><ul><li>Delen van <b>Spanje</b> hebben te maken met overstromingen.</li><li>Pas op voor zakkenrollers &amp; oplichters.</li><li>c</li><li>d</li><li>e</li></ul>";
eq("points stripped", extractPoints(intro, 2), ["Delen van Spanje hebben te maken met overstromingen.", "Pas op voor zakkenrollers & oplichters."]);
eq("points default max 4", extractPoints(intro).length, 4);
eq("no list", extractPoints("<p>Geen lijst</p>"), []);
eq("long bullet clipped", extractPoints(`<li>${"woord ".repeat(60)}</li>`)[0].endsWith("…"), true);

// entry
const content = [{ category: "Voorbereiding", contentblocks: [{ paragraphtitle: "Reisverzekering", paragraph: "<p>Sluit er een af.</p>" }, { paragraphtitle: "Paspoort en visum", paragraph: "<p>Je paspoort moet <b>6 maanden</b> geldig zijn.</p>" }] }];
eq("entry paragraph", extractEntry(content), "Je paspoort moet 6 maanden geldig zijn.");
eq("entry none", extractEntry([{ contentblocks: [{ paragraphtitle: "Bagage", paragraph: "x" }] }]), null);
eq("entry bad input", extractEntry(undefined), null);

// matching
eq("dutch name direct", loc("Spanje"), "Spanje");
eq("english country", loc("Spain"), "Spanje");
eq("city, country", loc("Panama City, Panama"), "Panama");
eq("aruba city", loc("Oranjestad, Aruba"), "Aruba");
eq("accent folding", loc("Curacao"), "Curaçao");
eq("USA alias", loc("Miami, USA"), "Verenigde Staten");
eq("United States", loc("New York, United States"), "Verenigde Staten");
eq("UK alias", loc("London, UK"), "Verenigd Koninkrijk");
eq("Dubai alias", loc("Dubai"), "Verenigde Arabische Emiraten");
eq("country wins over city", loc("Colombia, Panama"), "Panama");
eq("falls back to earlier part", loc("Panama, Somewhere Unknown"), "Panama");
eq("unknown", loc("Atlantis"), null);
eq("empty", loc(""), null);
eq("null", matchAdvisory(list, null), null);
eq("empty list", matchAdvisory([], "Spain"), null);
eq("sint maarten", loc("Philipsburg, St. Maarten"), "Sint Maarten");
eq("parts reversed", destinationParts("A, B, C"), ["C", "B", "A"]);
eq("hyphen name kept", destinationParts("Saint-Martin"), ["Saint-Martin"]);

eq("date iso", updatedDate("2026-10-05T14:58:37.504Z"), "2026-10-05");
eq("date bad", updatedDate("nope"), null);
eq("strip html", stripHtml("<p>a&nbsp;b</p><br/>c"), "a b c");

console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
