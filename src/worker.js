// worker.js
import { config } from './config/config';
import { verifyAuth,handleAuth } from './handlers/auth';
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

            
            // Public routes
            if (url.pathname === '/auth' && request.method === 'POST') {
                return handleAuth(request, env, requestId);
            }

            // User management endpoint (requires API key)
            if (url.pathname === '/user/plan' && request.method === 'POST') {
                return handleUserUpdate(request, env, requestId);
            }

            // Protected routes - verify authentication
            let userId;
            try {
                userId = await verifyAuth(request, env.JWT_SECRET);
            } catch (error) {
                log(requestId, `Auth error: ${error.message}`);
                return createResponse(401, error.message);
            }

             // Handle quota check endpoint
            if (url.pathname === '/quota' && request.method === 'GET') {
                return handleQuotaCheck(request, env, userId, requestId);
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