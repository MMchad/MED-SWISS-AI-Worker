// worker.js
import { config } from './config/config';
import { handleAuth, verifyAuth } from './handlers/auth';
import { analyzeText } from './services/openai';
import { createResponse, log } from './utils/utils';

export default {
    async fetch(request, env, ctx) {
        const requestId = crypto.randomUUID();
        log(requestId, `${request.method} ${request.url}`);

        // Log available environment variables (without values)
        log(requestId, `Available env keys: ${Object.keys(env).join(', ')}`);

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

            // Protected routes - verify authentication
            try {
                await verifyAuth(request, env.JWT_SECRET);
            } catch (error) {
                log(requestId, `Auth error: ${error.message}`);
                return createResponse(401, error.message);
            }

            // Analysis endpoint
            if (url.pathname === '/analyze' && request.method === 'POST') {
                // Verify required environment variables
                if (!env.OPENAI_API_KEY) {
                    log(requestId, 'Missing API Key');
                    return createResponse(500, 'Server configuration error');
                }

                const { text, actions, style = 'default' } = await request.json();

                if (!text || !Array.isArray(actions) || actions.length === 0) {
                    return createResponse(400, 'Text and actions required');
                }

                const lowerActions = actions.map(action => action.toLowerCase());
                const invalidTypes = lowerActions.filter(type => !config.analysisTypes.includes(type));
                
                if (invalidTypes.length > 0) {
                    return createResponse(400, `Invalid analysis types: ${invalidTypes.join(', ')}`);
                }

                log(requestId, `Starting analysis`, { 
                    actions: lowerActions, 
                    textLength: text.length,
                    style 
                });

                // Add style parameter to text if provided
                const formattedText = style !== 'default' 
                    ? `Style: ${style}\n\n${text}`
                    : text;

                // Process all analyses in parallel with proper env passing
                const results = await Promise.all(
                    lowerActions.map(type => 
                        analyzeText(formattedText, type, requestId, {
                            OPENAI_API_KEY: env.OPENAI_API_KEY
                        }).catch(error => {
                            log(requestId, `Error in ${type} analysis: ${error.message}`);
                            throw error;
                        })
                    )
                );

                // Create result object maintaining original action case
                const resultObject = actions.reduce((acc, type, index) => ({
                    ...acc,
                    [type]: results[index]
                }), {});

                log(requestId, `Analysis completed`, { actions });

                return createResponse(200, null, { results: resultObject });
            }

            return createResponse(404, 'Not Found');

        } catch (error) {
            log(requestId, `Error: ${error.message}`);
            
            if (error.message.includes('OpenAI')) {
                return createResponse(400, error.message);
            }

            return createResponse(500, error.message);
        }
    }
};