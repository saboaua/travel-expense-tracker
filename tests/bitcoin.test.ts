import { isBtcAddress, parseAddresses } from "../src/lib/bitcoin-address";
import { SATS, bip21, btcAmount, explorerTx, formatBtc, mmss, parseSpot, parseTxid, quoteExpired, secondsLeft } from "../src/lib/bitcoin";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// Known good mainnet addresses: native segwit, legacy, script, taproot
const good = ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr", "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3"];
for (const a of good) eq(`good ${a}`, isBtcAddress(a), true);
eq("uppercase segwit", isBtcAddress(good[0].toUpperCase()), true);
eq("mixed case segwit", isBtcAddress("Bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"), false);
// one changed character breaks the checksum
eq("bad segwit char", isBtcAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5"), false);
eq("bad legacy char", isBtcAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3"), false);
eq("bad p2sh char", isBtcAddress("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLz"), false);
eq("bad taproot char", isBtcAddress("bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcs"), false);
eq("testnet refused", isBtcAddress("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"), false);
eq("seed phrase refused", isBtcAddress("abandon abandon abandon about"), false);
eq("empty", isBtcAddress(""), false);
eq("private key refused", isBtcAddress("5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ"), false);

const p = parseAddresses(`${good[0]}\n${good[1]}, ${good[0].toUpperCase()}\n  \n${good[2]}`);
eq("parse valid, no duplicates", p.valid, [good[0], good[1], good[2]]);
eq("parse invalid", parseAddresses(`${good[0]}\nnot-an-address\nnot-an-address`).invalid, ["not-an-address"]);

// Amount: price in AWG, USD per AWG, BTC price in USD. Always rounded up to the satoshi.
eq("amount basic", btcAmount(179, 1 / 1.79, 50000), 0.002);
eq("amount rounds up", btcAmount(10, 0.558659, 54300), Math.ceil((10 * 0.558659) / 54300 * SATS) / SATS);
eq("amount zero price", btcAmount(0, 0.5, 50000), null);
eq("amount bad rate", btcAmount(10, 0.5, NaN), null);
eq("format 8 decimals", formatBtc(0.00123456), "0.00123456");
eq("format pads", formatBtc(0.002), "0.00200000");

const now = Date.parse("2026-11-15T10:00:00Z");
eq("not expired", quoteExpired("2026-11-15T10:00:01Z", now), false);
eq("expired at the moment", quoteExpired("2026-11-15T10:00:00Z", now), true);
eq("no date is expired", quoteExpired(null, now), true);
eq("seconds left", secondsLeft("2026-11-15T10:29:59Z", now), 1799);
eq("seconds never negative", secondsLeft("2026-11-15T09:00:00Z", now), 0);
eq("mmss", mmss(1799), "29:59");
eq("mmss zero", mmss(-5), "00:00");

eq("bip21", bip21(good[0], 0.00123456), `bitcoin:${good[0]}?amount=0.00123456&label=Lifolio%20Pro`);
const tx = "a".repeat(64);
eq("txid bare", parseTxid(tx.toUpperCase()), tx);
eq("txid from link", parseTxid(`https://mempool.space/tx/${tx}`), tx);
eq("txid short", parseTxid("abc"), null);
eq("explorer", explorerTx(tx), `https://mempool.space/tx/${tx}`);
eq("spot ok", parseSpot({ data: { amount: "54300.12" } }), 54300.12);
eq("spot junk", parseSpot({ data: { amount: "abc" } }), null);
eq("spot absurd", parseSpot({ data: { amount: "5" } }), null);

if (fail) process.exit(1);
console.log("bitcoin tests passed");
