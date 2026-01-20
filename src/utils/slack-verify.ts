/**
 * Slack Request Verification
 * 
 * Verifies that incoming requests are actually from Slack using
 * the signing secret and HMAC signature.
 */

/**
 * Verify a Slack request signature
 * 
 * @param request - The incoming request
 * @param body - The raw request body as a string
 * @param signingSecret - The Slack signing secret
 * @returns True if the signature is valid
 */
export async function verifySlackRequest(
  request: Request,
  body: string,
  signingSecret: string
): Promise<boolean> {
  const timestamp = request.headers.get('x-slack-request-timestamp');
  const signature = request.headers.get('x-slack-signature');

  if (!timestamp || !signature) {
    console.error('Missing Slack signature headers');
    return false;
  }

  // Check timestamp is within 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);
  
  if (Math.abs(now - requestTime) > 300) {
    console.error('Slack request timestamp too old');
    return false;
  }

  // Create the signing base string
  const sigBasestring = `v0:${timestamp}:${body}`;

  // Calculate the expected signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(sigBasestring)
  );

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const expectedSignature = 'v0=' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Constant-time comparison
  return timingSafeEqual(signature, expectedSignature);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
