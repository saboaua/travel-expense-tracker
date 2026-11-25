import { chooseCountry, codeOfCountryName, countryForShared, countryOfCurrency, currencyOfCountry, hasPriceData, normCountry, readCountryStats, readTraveler, sharedCountry, shouldAnnounce } from "../src/lib/country";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

eq("currency follows the country", [currencyOfCountry("SR"), currencyOfCountry("aw"), currencyOfCountry("PA"), currencyOfCountry("ZZ"), currencyOfCountry(null)], ["SRD", "AWG", "USD", null, null]);
eq("one country uses SRD, none owns USD", [countryOfCurrency("SRD"), countryOfCurrency("awg"), countryOfCurrency("USD")], ["SR", "AW", null]);
eq("a code is cleaned", [normCountry(" sr "), normCountry("SUR"), normCountry(""), normCountry(null)], ["SR", null, null, null]);
eq("home country name to code", [codeOfCountryName("Suriname"), codeOfCountryName("aruba"), codeOfCountryName("AW"), codeOfCountryName("Nowhere"), codeOfCountryName("")], ["SR", "AW", "AW", null, null]);

// one rule: picked, then where I am, then home
eq("a picked country wins", chooseCountry({ manual: "SR", detected: "AW", home: "SR" }), { country: "SR", source: "manual" });
eq("where I am wins over home", chooseCountry({ manual: null, detected: "AW", home: "SR" }), { country: "AW", source: "auto" });
eq("home is the last resort", chooseCountry({ manual: null, detected: null, home: "sr" }), { country: "SR", source: "home" });
eq("nothing known", chooseCountry({ manual: null, detected: null, home: null }), { country: null, source: "home" });
eq("a bad pick is ignored", chooseCountry({ manual: "xyz", detected: "AW", home: null }).country, "AW");

// the "Now showing" message
eq("announced when the country changes", shouldAnnounce("SR", "AW"), true);
eq("not announced the first time", shouldAnnounce(null, "AW"), false);
eq("not announced when it is the same", shouldAnnounce("aw", "AW"), false);

// countries that have data
const stats = readCountryStats([{ country: "AW", stores: 31, prices: 5940 }, { country: "sr", stores: 0, prices: 0 }, { country: "bad", stores: 1, prices: 1 }, { country: "CW", stores: 2 }]);
eq("only valid countries are read", stats.map((s) => s.country), ["AW", "SR", "CW"]);
eq("data is found per country", [hasPriceData(stats, "AW"), hasPriceData(stats, "SR"), hasPriceData(stats, "CW"), hasPriceData(stats, "GY"), hasPriceData(stats, null)], [true, false, true, false, false]);
eq("garbage gives no countries", readCountryStats("x"), []);

// the country a shared price is sent for
eq("SRD is Suriname whatever the person is", countryForShared("SRD", "AW"), "SR");
eq("a receipt's own country comes first, whatever the currency", [sharedCountry("PA", "USD", "AW"), sharedCountry("sr", "AWG", "AW"), sharedCountry(null, "AWG", "SR"), sharedCountry("", "USD", "sr"), sharedCountry(null, "USD", null)], ["PA", "SR", "AW", "SR", null]);
eq("USD takes the country the person is in", countryForShared("USD", "sr"), "SR");
eq("USD with no country is unknown", countryForShared("USD", null), null);

// Groceries traveler
eq("two countries earn it", readTraveler({ countries: ["SR", "AW"], seen: false }), { countries: ["AW", "SR"], seen: false, earned: true });
eq("one country does not", readTraveler([{ countries: ["SR"], seen: true }]).earned, false);
eq("a repeated or bad country is not counted twice", readTraveler({ countries: ["SR", "sr", "x"] }).countries, ["SR"]);
eq("nothing read is not earned", readTraveler(null), { countries: [], seen: false, earned: false });

if (fail) process.exit(1);
console.log("country tests passed");
