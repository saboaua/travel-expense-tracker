import assert from "node:assert/strict";
import { avatarColour, fromByReminder, initialOf, namesText, peopleByReminder } from "../src/lib/reminder-partners";

const names = new Map([["p1", "Maria"], ["p2", "Alex"]]);
const m = peopleByReminder([
  { reminder_id: "r1", partnership_id: "p2", can_complete: false },
  { reminder_id: "r1", partnership_id: "p1", can_complete: true },
  { reminder_id: "r2", partnership_id: "gone", can_complete: true },
], names);
assert.deepEqual(m.get("r1"), [{ partnershipId: "p2", name: "Alex", canComplete: false }, { partnershipId: "p1", name: "Maria", canComplete: true }]);
assert.equal(m.has("r2"), false, "a partner that is no longer active is left out");
assert.equal(fromByReminder([{ reminder_id: "r", owner_name: "Maria" }, { reminder_id: "s", owner_name: null }]).get("s"), "Someone");
assert.equal(namesText([]), "");
assert.equal(namesText(["Maria"]), "Maria");
assert.equal(namesText(["Maria", "Alex"]), "Maria and Alex");
assert.equal(namesText(["Maria", "Alex", "Sam"]), "Maria, Alex and Sam");
assert.equal(avatarColour("Maria"), avatarColour("Maria"));
assert.equal(initialOf(" maria"), "M");
assert.equal(initialOf(""), "?");
console.log("reminder partners ok");
