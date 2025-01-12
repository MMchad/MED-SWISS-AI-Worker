// handlers/auth.js
import { createResponse, log } from '../utils/utils';

export async function handleAuth(request, env, requestId) {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            log(requestId, 'Missing credentials');
            return createResponse(400, 'Username and password required');
        }

        log(requestId, `Auth request for user: ${username}`);

        // Call WordPress API to validate user
        const apiUrl = `${env.API_URL}/validate-user`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                password,
                random_param: env.RANDOM_PARAM
            })
        });

        const userData = await response.json();

        if (!userData?.userID) {
            log(requestId, `Auth failed for user: ${username}`);
            return createResponse(401, 'Invalid credentials');
        }

        // Generate JWT token
        const token = await generateToken({
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
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

export async function verifyAuth(request, secret) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        throw new Error('Unauthorized');
    }

    const token = authHeader.split(' ')[1];
    const { userID } = await verifyJWT(token, secret);
    return parseInt(userID);
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

async function verifyJWT(token, secret) {
    const [headerB64, payloadB64, signatureB64] = token.split('.');

    if (!headerB64 || !payloadB64 || !signatureB64) {
        throw new Error('Invalid token format');
    }

    // Verify signature
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

    const isValid = await crypto.subtle.verify(
        'HMAC',
        cryptoKey,
        signatureData,
        messageData
    );

    if (!isValid) {
        throw new Error('Invalid token signature');
    }

    // Decode payload
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired');
    }

    return payload;
}

function base64UrlEncode(str) {
    return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}