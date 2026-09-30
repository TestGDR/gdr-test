import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

// Domanda anti-robot "quanto fa A + B?". Il risultato non viene mai inviato al
// browser: il token contiene solo scadenza e firma HMAC del risultato giusto.
export type Captcha = { a: number; b: number; token: string };

const TTL_MS = 15 * 60 * 1000;

function secret() {
  return process.env.CAPTCHA_SECRET ?? process.env.SUPABASE_SECRET_KEY ?? "solo-sviluppo-locale";
}

function sign(answer: number, expires: number) {
  return createHmac("sha256", secret()).update(`${answer}.${expires}`).digest("hex");
}

export function createCaptcha(): Captcha {
  const a = randomInt(1, 10);
  const b = randomInt(1, 10);
  const expires = Date.now() + TTL_MS;
  return { a, b, token: `${expires}.${sign(a + b, expires)}` };
}

export function verifyCaptcha(token: string, answer: string): boolean {
  const [expiresRaw, signature] = token.split(".");
  const expires = Number(expiresRaw);
  const value = Number(answer.trim());
  if (!signature || !Number.isFinite(expires) || expires < Date.now()) return false;
  if (!Number.isInteger(value)) return false;

  const expected = Buffer.from(sign(value, expires), "hex");
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
