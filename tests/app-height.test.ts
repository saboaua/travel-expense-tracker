import { appHeight, standaloneHeight } from "../src/lib/app-height";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

eq("normal: both agree", appHeight(844, 844, false), 844);
eq("browser bar: the visible part is a little shorter", appHeight(790, 844, false), 790);
eq("coming back from the background: a half height is not believed", appHeight(420, 844, false), 844);
eq("keyboard up while typing: the short height is believed", appHeight(420, 844, true), 420);
eq("never taller than the window", appHeight(900, 844, false), 844);
eq("no visual viewport", appHeight(null, 844, false), 844);
eq("nothing known", appHeight(undefined, 0, false), 0);
eq("rounded", appHeight(843.6, 844, false), 844);

eq("installed iPhone portrait uses the full screen", standaloneHeight(393, 852, false, false), 852);
eq("installed iPhone landscape uses the short side", standaloneHeight(393, 852, true, false), 393);
eq("typing keeps the keyboard-aware height", standaloneHeight(393, 852, false, true), 0);

if (fail) process.exit(1);
console.log("app-height tests passed");
