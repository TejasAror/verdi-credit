const bs58Module = require("bs58");
const bs58 = bs58Module.default || bs58Module;
const fs = require("fs");

const privateKey = "4WCREm7EkhDYbmoaUt9W6zunU5R2hxAZX4b5GHUHndRYMjDwsTnXNjqKyjVFvzNLbqohNXZEuymN81hMg4LChnnF";

const secretKey = bs58.decode(privateKey);

if (secretKey.length !== 64) {
  throw new Error(`Invalid secret key length: ${secretKey.length}. Expected 64 bytes.`);
}

fs.writeFileSync(
  "phantom-keypair.json",
  JSON.stringify(Array.from(secretKey))
);

console.log("✅ phantom-keypair.json created");