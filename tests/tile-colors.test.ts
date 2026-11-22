import { TILE_COLORS, TILE_IDS, cleanTileColors, tileColor, withTileColor } from "../src/lib/tile-colors";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

eq(tileColor({}, "types"), "#db2777", "Other starts rose, not the orange Shopping uses");
eq(tileColor({}, "fixed"), null, "a page with no default keeps its standard colour");
eq(tileColor({ fixed: "#7c3aed" }, "fixed"), "#7c3aed", "a picked colour wins");
eq(cleanTileColors(null), {}, "nothing saved gives no colours");
eq(cleanTileColors({ fixed: "#7C3AED", budget: "red", nope: "#2563eb", savings: 5 }), { fixed: "#7c3aed" }, "only known pages and offered colours are kept");
eq(cleanTileColors([1, 2]), {}, "a list is not a set of colours");
eq(withTileColor({ fixed: "#7c3aed" }, "budget", "#2563eb"), { fixed: "#7c3aed", budget: "#2563eb" }, "one page changes, the others stay");
eq(withTileColor({ fixed: "#7c3aed" }, "fixed", null), {}, "Use default removes the colour");
eq(withTileColor({}, "fixed", "#123456"), {}, "a colour that is not offered is ignored");
eq(TILE_IDS.length === new Set(TILE_IDS).size && TILE_COLORS.length === 10, true, "ten colours, each page listed once");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
