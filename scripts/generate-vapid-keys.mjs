import { generateKeyPairSync, randomBytes } from "node:crypto";

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

const subject = process.argv[2] || "mailto:you@example.com";
const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { format: "jwk" },
  privateKeyEncoding: { format: "jwk" },
});

const publicPoint = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(publicKey.x, "base64url"),
  Buffer.from(publicKey.y, "base64url"),
]);

const vapidPublicKey = toBase64Url(publicPoint);
const vapidPrivateKey = String(privateKey.d);
const internalSecret = toBase64Url(randomBytes(32));

console.log("\n# .env.local");
console.log(`VITE_VAPID_PUBLIC_KEY=${vapidPublicKey}`);
console.log("\n# Supabase Edge Function secrets");
console.log(`WEB_PUSH_VAPID_PUBLIC_KEY=${vapidPublicKey}`);
console.log(`WEB_PUSH_VAPID_PRIVATE_KEY=${vapidPrivateKey}`);
console.log(`WEB_PUSH_VAPID_SUBJECT=${subject}`);
console.log(`WEB_PUSH_INTERNAL_SECRET=${internalSecret}`);
console.log("\n# Supabase Vault");
console.log("web_push_function_url=https://<PROJECT-REF>.supabase.co/functions/v1/send-web-push");
console.log(`web_push_function_secret=${internalSecret}`);
