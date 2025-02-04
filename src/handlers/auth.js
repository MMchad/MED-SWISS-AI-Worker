// handlers/auth.js
import { createResponse, log } from '../utils/utils';

export async function handleAuth(request, env, requestId) {
    try {
        // Log the incoming request
        log(requestId, 'Auth request received', {
            headers: Object.fromEntries(request.headers),
            url: request.url
        });

        const body = await request.json();
        log(requestId, 'Request body:', { 
            username: body.username,
            hasPassword: !!body.password 
        });

        const { username, password } = body;

        if (!username || !password) {
            log(requestId, 'Missing credentials');
            return createResponse(400, 'Username and password required');
        }

        // Log WordPress API call details and request body
        const wpUrl = `${env.API_URL}/validate-user`;
        const requestBody = {
            username,
            password,
            random_param: env.RANDOM_PARAM
        };

        log(requestId, 'Making WordPress API call', { 
            url: wpUrl,
            requestBody: { ...requestBody, password: '[REDACTED]' },
            randomParamExists: !!env.RANDOM_PARAM,
            randomParamValue: env.RANDOM_PARAM
        });

        try {
            // Call WordPress API to validate user
            const response = await fetch(wpUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            // Log response status and headers
            log(requestId, 'WordPress API response received', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers),
                type: response.type,
                url: response.url
            });

            // Get response as text first
            const responseText = await response.text();
            log(requestId, 'WordPress API response body:', responseText);

            // Try to parse JSON
            let userData;
            try {
                userData = JSON.parse(responseText);
                log(requestId, 'Parsed response data:', userData);
            } catch (e) {
                log(requestId, 'Failed to parse response as JSON', {
                    error: e.message,
                    responsePreview: responseText.substring(0, 200) // First 200 chars
                });
                return createResponse(500, 'Invalid response from WordPress API');
            }

            if (!userData?.userID) {
                log(requestId, 'Auth failed - no userID in response', userData);
                return createResponse(401, 'Invalid credentials');
            }

            // Generate JWT token
            const token = await generateToken({
                exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
                username: username,
                userID: userData.userID
            }, env.JWT_SECRET);

            log(requestId, 'Auth successful, token generated');

            return createResponse(200, null, { token });

        } catch (error) {
            log(requestId, 'WordPress API call failed', {
                error: error.message,
                stack: error.stack
            });
            return createResponse(500, 'Failed to connect to WordPress API');
        }

    } catch (error) {
        log(requestId, 'Fatal auth error', {
            error: error.message,
            stack: error.stack,
            type: error.constructor.name
        });
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