import crypto from 'crypto';

/** Constant-time string compare that never throws on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify a LINE webhook.
 * Fail-CLOSED: if the secret is configured, a valid `x-line-signature`
 * (base64 HMAC-SHA256 of the raw body) is REQUIRED. If no secret is set
 * (local/dev), verification is skipped.
 */
export function verifyLineSignature(raw: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return true; // dev mode — no secret configured
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  return safeEqual(signature, expected);
}

/**
 * Verify a Meta (Facebook/Instagram/WhatsApp) webhook via
 * `x-hub-signature-256: sha256=<hex>` using META_APP_SECRET.
 * Fail-CLOSED when the secret is configured.
 */
export function verifyMetaSignature(raw: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // dev mode — no secret configured
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const provided = signatureHeader.slice('sha256='.length);
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return safeEqual(provided, expected);
}

/** Generic hex HMAC-SHA256 verifier for partner platforms (Shopee/TikTok). */
export function verifyHexHmac(raw: string, signature: string | null, secret: string | undefined): boolean {
  if (!secret) return true; // dev mode
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return safeEqual(signature.toLowerCase(), expected.toLowerCase());
}

/**
 * Verify an ecom-data-platform outbound webhook.
 * `X-Ecom-Hmac-Sha256 = base64( HMAC-SHA256( rawBody, SHA256(api_key_hex) ) )`.
 * Fail-CLOSED when the API key is configured.
 */
export function verifyEcomWebhook(raw: string, signature: string | null, apiKey: string | undefined): boolean {
  if (!apiKey) return true; // dev mode — no key configured
  if (!signature) return false;
  const signingSecret = crypto.createHash('sha256').update(apiKey).digest('hex');
  const expected = crypto.createHmac('sha256', signingSecret).update(raw).digest('base64');
  return safeEqual(signature, expected);
}
