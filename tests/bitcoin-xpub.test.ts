import { deriveAddress, parseExtendedKey, previewAddresses } from "../src/lib/bitcoin-xpub";
import { isBtcAddress } from "../src/lib/bitcoin-address";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// The BIP 84 test key: its first receiving addresses are published
const Z = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
const z = parseExtendedKey(Z);
eq("zpub is read as native segwit", z.ok && z.type, "native");
if (z.ok) {
  eq("first addresses match the published ones", previewAddresses(z.key, "native", 2), ["bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu", "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g"]);
  eq("same address every time", deriveAddress(z.key, "native", 5), deriveAddress(z.key, "native", 5));
  eq("numbers give different addresses", deriveAddress(z.key, "native", 5) !== deriveAddress(z.key, "native", 6), true);
  for (const type of ["legacy", "segwit", "native"] as const) {
    const a = deriveAddress(z.key, type, 3);
    eq(`${type} address passes the checksum`, isBtcAddress(a), true);
    eq(`${type} address has the right start`, type === "legacy" ? a[0] === "1" : type === "segwit" ? a[0] === "3" : a.startsWith("bc1q"), true);
  }
}
eq("private key refused", parseExtendedKey("zprvAWgYBBk7JR8Gjrh4UJQ2uJdG1r3WNRRfURiABBE3RvMXYSrRJL62XuezvGdPvG6GFBZduosCc1YP5wixPox7zhZLfiUm8aunE96BBa4Kei5").ok, false);
eq("seed phrase refused", parseExtendedKey("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about").ok, false);
eq("a changed character is refused", parseExtendedKey(Z.slice(0, -1) + "t").ok, false);
eq("an address is refused", parseExtendedKey("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4").ok, false);
eq("empty", parseExtendedKey("  ").ok, false);
// an xpub-prefixed key takes the type the admin chooses
const x = parseExtendedKey(Z.replace(/^zpub/, "zpub"), "legacy");
eq("zpub ignores a chosen type", x.ok && x.type, "native");

if (fail) process.exit(1);
console.log("bitcoin xpub tests passed");
