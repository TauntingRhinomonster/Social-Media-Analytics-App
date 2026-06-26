import { strict as assert } from "node:assert";
import { encryptToken, decryptToken } from "./crypto.js";

const key = Buffer.alloc(32, 7).toString("base64");
const plaintext = "test-access-token-12345";

const encrypted = encryptToken(plaintext, key);
const decrypted = decryptToken(encrypted, key);

assert.equal(decrypted, plaintext);
console.log("crypto.test.ts: ok");
