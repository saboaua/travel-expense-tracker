import { downscaleGray, hasGlare, pickRotation, rotateGray, type GrayImage } from "../src/lib/ocr-image";
(async () => {

const eq = (a: unknown, b: unknown, m: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  if (!ok) process.exitCode = 1;
};

// 3 wide x 2 high: row 0 = 1 2 3, row 1 = 4 5 6
const img: GrayImage = { gray: new Uint8ClampedArray([1, 2, 3, 4, 5, 6]), w: 3, h: 2 };
let r = rotateGray(img, 1);
eq([r.w, r.h, Array.from(r.gray)], [2, 3, [4, 1, 5, 2, 6, 3]], "90 degrees clockwise");
r = rotateGray(img, 2);
eq(Array.from(r.gray), [6, 5, 4, 3, 2, 1], "180 degrees");
r = rotateGray(img, 3);
eq([r.w, r.h, Array.from(r.gray)], [2, 3, [3, 6, 2, 5, 1, 4]], "270 degrees clockwise");
eq(Array.from(rotateGray(rotateGray(img, 1), 3).gray), Array.from(img.gray), "a turn and its reverse give the original");
eq(rotateGray(img, 4) === img, true, "four quarter turns is the same image");

const big: GrayImage = { gray: new Uint8ClampedArray(2000 * 1000).fill(7), w: 2000, h: 1000 };
const small = downscaleGray(big, 500);
eq([small.w, small.h, small.gray[0]], [500, 250, 7], "downscale keeps the proportions");

// direction: the score is high only for the turn that makes the "text" upright
const score = (target: number) => async (i: GrayImage) => (i.w === 2 && i.h === 3 ? 80 : 20) + (Array.from(i.gray).join() === Array.from(rotateGray(img, target).gray).join() ? 30 : 0);
let p = await pickRotation(img, score(1));
eq(p.turns, 1, "the turn that scores best is chosen");
p = await pickRotation(img, async () => 50);
eq(p.turns, 0, "equal scores: the photo stays as it is");
p = await pickRotation(img, async (i) => (i === img ? 50 : 55));
eq(p.turns, 0, "a turn that is only slightly better is not enough");

// glare: dark text on paper, with and without a blown-out patch over the text
const W = 320, H = 320;
const page = (blow: boolean): GrayImage => {
  const g = new Uint8ClampedArray(W * H).fill(228);
  for (let y = 20; y < H - 20; y++) for (let x = 20; x < W - 20; x++) if (x % 5 < 3 && (y - 20) % 12 < 4) g[y * W + x] = 40; // thin text rows
  if (blow) for (let y = 90; y < 220; y++) for (let x = 100; x < 260; x++) g[y * W + x] = 255;
  return { gray: g, w: W, h: H };
};
eq(hasGlare(page(false)), false, "an evenly lit page has no glare");
eq(hasGlare(page(true)), true, "a washed-out patch over the text is glare");
const bright: GrayImage = page(false);
for (let i = 0; i < bright.gray.length; i++) if (bright.gray[i] > 200) bright.gray[i] = 255;
for (let y = 0; y < 8; y++) for (let x = 0; x < W; x++) bright.gray[y * W + x] = 255;
eq(hasGlare({ gray: new Uint8ClampedArray(W * H).fill(255), w: W, h: H }), false, "a blank white image is not glare (no text to lose)");
})();
