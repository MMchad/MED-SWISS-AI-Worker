// handlers/analysis.js
import { createResponse, log } from '../utils/utils';
import { config } from '../config/config';
import { analyzeText } from '../services/openai';
import { checkQuota } from './users';

export async function handleAnalysis(request, env, userId, requestId) {
    try {
        const { text, actions, style = 'default' } = await request.json();

        if (!text || !Array.isArray(actions) || actions.length === 0) {
            return createResponse(400, 'Text and actions required');
        }

        // Check quota before processing
        try {
            await checkQuota(userId, actions.length, env, requestId);
        } catch (error) {
            return createResponse(403, error.message);
        }

        const lowerActions = actions.map(action => action.toLowerCase());
        const invalidTypes = lowerActions.filter(type => !config.analysisTypes.includes(type));
        
        if (invalidTypes.length > 0) {
            return createResponse(400, `Invalid analysis types: ${invalidTypes.join(', ')}`);
        }

        const formattedText = style !== 'default' 
            ? `Style: ${style}\n\n${text}`
            : text;

        const results = await Promise.all(
            lowerActions.map(type => 
                analyzeText(formattedText, type, requestId, {
                    OPENAI_API_KEY: env.OPENAI_API_KEY
                })
            )
        );

        const resultObject = actions.reduce((acc, type, index) => ({
            ...acc,
            [type]: results[index]
        }), {});

        return createResponse(200, null, { results: resultObject });

    } catch (error) {
        log(requestId, `Analysis error: ${error.message}`);
        return createResponse(500, error.message);
    }
}