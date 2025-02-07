// worker.js
import { config } from './config/config';
import { verifyAuth } from './handlers/auth';
import { handleUserUpdate } from './handlers/users';
import { handleAnalysis } from './handlers/analysis';
import { createResponse, log } from './utils/utils';
import { handleQuotaCheck } from './handlers/users';

export default {
    async fetch(request, env, ctx) {
        const requestId = crypto.randomUUID();
        log(requestId, `${request.method} ${request.url}`);

        try {
            // Handle CORS preflight
            if (request.method === 'OPTIONS') {
                return new Response(null, { 
                    headers: config.cors.headers 
                });
            }

            const url = new URL(request.url);
            
            // User management endpoint (requires API key)
            if (url.pathname === '/user/plan' && request.method === 'POST') {
                return handleUserUpdate(request, env, requestId);
            }

            // All other endpoints require JWT verification
            let userId;
            try {
                userId = await verifyAuth(request, env.JWT_SECRET);
            } catch (error) {
                log(requestId, `Auth error: ${error.message}`);
                return createResponse(401, error.message);
            }

            // Handle quota check endpoint
            if (url.pathname === '/quota' && request.method === 'GET') {
                // Get user ID from token verification
                if (!userId) {
                    return createResponse(401, 'Unauthorized - Missing user ID');
                }
                return handleQuotaCheck(request, env, parseInt(userId), requestId);
            }

            // Analysis endpoint
            if (url.pathname === '/analyze' && request.method === 'POST') {
                return handleAnalysis(request, env, userId, requestId);
            }

            return createResponse(404, 'Not Found');

        } catch (error) {
            log(requestId, `Error: ${error.message}`);
            return createResponse(500, error.message);
        }
    }
};