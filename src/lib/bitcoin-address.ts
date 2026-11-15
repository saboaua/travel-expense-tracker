/** Bitcoin address checks (mainnet). Checksums are verified, so a mistyped address is refused before it reaches a customer. Server and tests only. */
import { createHash } from "node:crypto";

const B32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}
const expandHrp = (hrp: string) => [...hrp].map((c) => c.charCodeAt(0) >>> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31));

function segwit(addr: string): boolean {
  if (addr !== addr.toLowerCase() && addr !== addr.toUpperCase()) return false;
  const a = addr.toLowerCase();
  const pos = a.lastIndexOf("1");
  if (pos < 1 || pos + 7 > a.length || a.length > 90 || !a.startsWith("bc1")) return false;
  const data: number[] = [];
  for (const c of a.slice(pos + 1)) { const i = B32.indexOf(c); if (i < 0) return false; data.push(i); }
  const version = data[0];
  if (version > 16) return false;
  const check = polymod([...expandHrp("bc"), ...data]);
  if (check !== (version === 0 ? 1 : 0x2bc830a3)) return false;
  // program length: 20 or 32 bytes for v0, 32 for taproot (v1), 2 to 40 otherwise
  const words = data.slice(1, -6);
  let acc = 0, bits = 0; const out: number[] = [];
  for (const w of words) { acc = (acc << 5) | w; bits += 5; while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); acc &= (1 << bits) - 1; } }
  if (bits >= 5 || (acc << (8 - bits)) & 255) return false;
  if (out.length < 2 || out.length > 40) return false;
  if (version === 0) return out.length === 20 || out.length === 32;
  if (version === 1) return out.length === 32;
  return true;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58check(addr: string): boolean {
  if (addr.length < 26 || addr.length > 35) return false;
  // base58 to bytes without BigInt (the project targets an older ES level)
  const digits: number[] = [];
  for (const c of addr) {
    let carry = B58.indexOf(c); if (carry < 0) return false;
    for (let j = 0; j < digits.length; j++) { carry += digits[j] * 58; digits[j] = carry & 255; carry >>= 8; }
    while (carry > 0) { digits.push(carry & 255); carry >>= 8; }
  }
  const zeros = addr.length - addr.replace(/^1+/, "").length;
  const bytes = Buffer.from([...new Array(zeros).fill(0), ...digits.reverse()]);
  if (bytes.length !== 25 || (bytes[0] !== 0x00 && bytes[0] !== 0x05)) return false;
  const sum = createHash("sha256").update(createHash("sha256").update(bytes.subarray(0, 21)).digest()).digest();
  return sum.subarray(0, 4).equals(bytes.subarray(21));
}

export function isBtcAddress(addr: string): boolean {
  const a = addr.trim();
  if (!a || /\s/.test(a)) return false;
  return /^(bc1|BC1)/.test(a) ? segwit(a) : base58check(a);
}

/** Split pasted text (one address per line, or separated by commas or spaces) into good and bad. Duplicates are dropped. */
export function parseAddresses(text: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>(); const valid: string[] = []; const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const t = raw.trim(); if (!t) continue;
    if (isBtcAddress(t)) { const key = /^bc1/i.test(t) ? t.toLowerCase() : t; if (!seen.has(key)) { seen.add(key); valid.push(key); } }
    else if (!invalid.includes(t)) invalid.push(t.slice(0, 80));
  }
  return { valid, invalid };
}
