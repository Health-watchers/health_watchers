import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY ?? "";
  if (hex.length !== 64) throw new Error("FIELD_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  return Buffer.from(hex, "hex");
}

/** Returns `iv:ciphertext:tag` as a hex-colon string. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${ct.toString("hex")}:${tag.toString("hex")}`;
}

/** Accepts the `iv:ciphertext:tag` format produced by `encrypt`. */
export function decrypt(encoded: string): string {
  const [ivHex, ctHex, tagHex] = encoded.split(":");
  if (!ivHex || !ctHex || !tagHex) return encoded; // not encrypted — return as-is
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(ctHex, "hex")).toString("utf8") + decipher.final("utf8");
}
