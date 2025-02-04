import { createResponse, log } from '../utils/utils';
import { config } from '../config/config';
import { analyzeText } from '../services/openai';
import { checkQuota } from './users';

export async function handleAnalysis(request, env, userId, requestId) {
    try {
        const { text, actions, style = 'default', gender = 'default' } = await request.json();

        if (!text || !Array.isArray(actions) || actions.length === 0) {
            return createResponse(400, 'Text, actions, style, and gender are required');
        }

        // Check user quota
        let quotaInfo;
        try {
            quotaInfo = await checkQuota(userId, actions.length, env, requestId);
        } catch (error) {
            return createResponse(403, error.message);
        }

        // Validate action types
        const lowerActions = actions.map(action => action.toLowerCase());
        const invalidActions = lowerActions.filter(action => !config.analysisTypes.includes(action));
        if (invalidActions.length > 0) {
            return createResponse(400, `Invalid action(s): ${invalidActions.join(', ')}`);
        }

        log(requestId, 'Starting analysis', { userId, actions, style, gender });

        // Prepare formatted text by explicitly including style and gender
        const formattedText = [
            style !== 'default' ? `Style: ${style}` : null,
            gender !== 'default' ? `Gender: ${gender}` : null,
            text
        ].filter(Boolean).join('\n\n');

        log("HERE : " + formattedText);
        
        // Process actions concurrently
        const results = await Promise.all(
            lowerActions.map(action =>
                analyzeText(formattedText, action, requestId, {
                    OPENAI_API_KEY: env.OPENAI_API_KEY,
                })
            )
        );

        // Construct results object
        const resultObject = actions.reduce((acc, action, index) => {
            acc[action] = results[index];
            return acc;
        }, {});

        log(requestId, 'Analysis completed successfully', { userId, resultObject });

        // Include quota information in the response
        return createResponse(200, null, {
            results: resultObject,
            quota: {
                used: quotaInfo.usedRequests,
                total: quotaInfo.totalRequests,
                remaining: quotaInfo.remainingRequests,
            },
        });

    } catch (error) {
        log(requestId, `Analysis error: ${error.message}`);
        return createResponse(500, error.message);
    }
}
