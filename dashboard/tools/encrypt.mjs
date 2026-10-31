// Encrypts the dashboard data so it can live on a public GitHub Pages site.
// Usage: node encrypt.mjs <data.json> <password> <out data.enc.json>
// The plaintext JSON is NOT committed. Keep it somewhere private.
import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto as c, randomBytes } from "node:crypto";
const [src, pass, out] = process.argv.slice(2);
if (!src || !pass || !out) { console.error("usage: node encrypt.mjs data.json password data.enc.json"); process.exit(1); }
const plain = JSON.stringify(JSON.parse(readFileSync(src, "utf8")));
const salt = randomBytes(16), iv = randomBytes(12), iter = 250000;
const base = await c.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
const key = await c.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const ct = new Uint8Array(await c.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
const b = (u) => Buffer.from(u).toString("base64");
writeFileSync(out, JSON.stringify({ v: 1, iter, salt: b(salt), iv: b(iv), ct: b(ct) }));
console.log("wrote", out);
