/** Make receiving addresses from a wallet's public key (xpub, ypub or zpub). The app never holds a key that can spend. Server and tests only. */
import { HDKey } from "@scure/bip32";
import { bech32, createBase58check } from "@scure/base";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { sha256 } from "@noble/hashes/sha256";

export type XpubType = "legacy" | "segwit" | "native";
export const XPUB_TYPE_LABEL: Record<XpubType, string> = { legacy: "Legacy (1…)", segwit: "SegWit (3…)", native: "Native SegWit (bc1q…)" };

const VERSIONS = { xpub: 0x0488b21e, ypub: 0x049d7cb2, zpub: 0x04b24746 } as const;
const b58 = createBase58check(sha256);
const hash160 = (b: Uint8Array) => ripemd160(sha256(b));

export type ParsedKey = { ok: true; prefix: "xpub" | "ypub" | "zpub"; type: XpubType; key: HDKey } | { ok: false; error: string };

/** Read what the admin pasted. Private keys and anything else are refused with a sentence that says why. */
export function parseExtendedKey(text: string, chosenType?: XpubType): ParsedKey {
  const t = (text ?? "").trim();
  if (!t) return { ok: false, error: "Paste the public key from your wallet." };
  if (/^[xyz]prv/i.test(t) || /^[xyzt]?(priv|prv)/i.test(t)) return { ok: false, error: "That is a private key. Never paste it. Paste the public key, which starts with xpub, ypub or zpub." };
  if (/\s/.test(t)) return { ok: false, error: "That looks like words, not a key. If it is a seed phrase, do not paste it anywhere. Paste the public key that starts with xpub, ypub or zpub." };
  const prefix = t.slice(0, 4);
  if (prefix !== "xpub" && prefix !== "ypub" && prefix !== "zpub") return { ok: false, error: "The key must start with xpub, ypub or zpub." };
  let key: HDKey;
  try { key = HDKey.fromExtendedKey(t, { private: 0, public: VERSIONS[prefix] }); } catch { return { ok: false, error: "That is not a valid public key. Check that it was copied whole." }; }
  if (!key.publicKey || key.privateKey) return { ok: false, error: "That is not a public key." };
  const type: XpubType = prefix === "zpub" ? "native" : prefix === "ypub" ? "segwit" : chosenType ?? "legacy";
  return { ok: true, prefix, type, key };
}

/** The receiving address number `index` (the first chain of the key: m/0/index). */
export function deriveAddress(key: HDKey, type: XpubType, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) throw new Error("Bad address number");
  const pub = key.derive(`m/0/${index}`).publicKey;
  if (!pub) throw new Error("Could not derive");
  const h = hash160(pub);
  if (type === "native") return bech32.encode("bc", [0, ...bech32.toWords(h)]);
  if (type === "legacy") return b58.encode(Uint8Array.from([0x00, ...h]));
  const redeem = Uint8Array.from([0x00, 0x14, ...h]);
  return b58.encode(Uint8Array.from([0x05, ...hash160(redeem)]));
}

/** For the screen: the first addresses to compare with the wallet. */
export function previewAddresses(key: HDKey, type: XpubType, count = 2): string[] {
  return Array.from({ length: count }, (_, i) => deriveAddress(key, type, i));
}
