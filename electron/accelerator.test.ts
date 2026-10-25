// Run with: node electron/accelerator.test.ts (no test framework, no deps).
// CommonJS require so `node` resolves ./accelerator.ts without an import extension tsc rejects.
const assert: typeof import("node:assert/strict") = require("node:assert/strict");
const { isValidAccelerator } = require("./accelerator.ts") as typeof import("./accelerator");

const REJECTED = [
  "CommandOrControl+ ",           // Ctrl+Space — e.key === " " trimmed away, leaves no key
  "CommandOrControl+Shift++",     // Ctrl+Shift++ — "+" is the separator, not a key
  "Dead",
  "AltGraph",
  "Fn",
  "Unidentified",
  "",                             // empty
  "E",                            // no modifier: parses, but would hijack a bare key
  "Control",                      // modifier only, no key
  "CommandOrControl+Dead+E",      // Electron accepts this as plain Ctrl+E; we don't
  "CommandOrControl+É",           // non-ASCII
  "CommandOrControl+F25",         // there is no F25
];

const ACCEPTED = [
  "CommandOrControl+Shift+E",
  "CommandOrControl+Return",
  "CommandOrControl+Alt+1",
  "CommandOrControl+Space",       // the correct spelling of Ctrl+Space
  "CommandOrControl+Plus",        // the correct spelling of Ctrl++
  "CommandOrControl+Up",
  "CommandOrControl+F12",
  "Alt+num5",
  "commandorcontrol+shift+e",     // tokens are matched case-insensitively
  "CommandOrControl + Shift + E", // Electron trims whitespace around each token
];

for (const acc of REJECTED) {
  assert.equal(isValidAccelerator(acc), false, `should reject ${JSON.stringify(acc)}`);
}
for (const acc of ACCEPTED) {
  assert.equal(isValidAccelerator(acc), true, `should accept ${JSON.stringify(acc)}`);
}

// Non-strings reach this from electron-store, which is why the signature is `unknown`.
assert.equal(isValidAccelerator(undefined), false);
assert.equal(isValidAccelerator(null), false);
assert.equal(isValidAccelerator(42), false);
assert.equal(isValidAccelerator({ action: "CommandOrControl+E" }), false);

console.log(`accelerator: ${ACCEPTED.length} accepted, ${REJECTED.length + 4} rejected`);