import { config } from '../config/config';
import { validateUser } from '../services/wordpress';
import { createResponse, log } from '../utils/utils';

// Base64Url encoding helper
function base64UrlEncode(str) {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Decode base64Url
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return atob(str);
}

async function generateToken(payload, secret) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    messageData
  );

  const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
  return `${message}.${encodedSignature}`;
}

async function verifySignature(token, secret) {
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  const message = `${headerB64}.${payloadB64}`;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureData = Uint8Array.from(
    atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0)
  );

  return crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    signatureData,
    messageData
  );
}

export async function verifyAuth(request, secret) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const token = authHeader.split(' ')[1];
  const [headerB64, payloadB64, signatureB64] = token.split('.');

  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error('Invalid token format');
  }

  // Verify signature
  const isValid = await verifySignature(token, secret);
  if (!isValid) {
    throw new Error('Invalid token signature');
  }

  // Check expiration
  const payload = JSON.parse(base64UrlDecode(payloadB64));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
}

export async function handleAuth(request, env, requestId) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      log(requestId, 'Missing credentials');
      return createResponse(400, 'Username and password required');
    }

    log(requestId, `Auth request for user: ${username}`);

    // Call MediSwiss API to validate user
    const userData = await validateUser(username, password, env.RANDOM_PARAM, requestId);

    if (!userData?.userID) {
      log(requestId, `Auth failed for user: ${username}`);
      return createResponse(401, 'Invalid credentials');
    }

    // Generate JWT token
    const token = await generateToken({
      exp: Math.floor(Date.now() / 1000) + config.jwt.expiryTime,
      username: username,
      userID: userData.userID
    }, env.JWT_SECRET);

    log(requestId, `Auth successful for user: ${username}`);

    return createResponse(200, null, { token });

  } catch (error) {
    log(requestId, `Auth error: ${error.message}`);
    return createResponse(500, error.message);
  }
}