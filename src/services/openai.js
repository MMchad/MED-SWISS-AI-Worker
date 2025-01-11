// services/openai.js
import { config } from '../config/config';
import { log } from '../utils/utils';

// Store active threads for each assistant type
const activeThreads = new Map();

async function fetchAPI(endpoint, options = {}, requestId, apiKey) {
    const startTime = Date.now();
    
    try {
        log(requestId, `OpenAI API request to ${endpoint}`);
        const response = await fetch(`${config.api.openai.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'OpenAI-Beta': 'assistants=v2',
                ...options.headers
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenAI API request failed');
        }

        const duration = Date.now() - startTime;
        log(requestId, `OpenAI API call completed`, {
            endpoint,
            duration: `${duration}ms`,
            status: response.status
        });

        return response.json();
    } catch (error) {
        log(requestId, `OpenAI API error: ${error.message}`);
        throw error;
    }
}

async function createThread(requestId, apiKey) {
    return fetchAPI('/threads', {
        method: 'POST',
        body: JSON.stringify({
            metadata: { source: 'mediswiss-ai-worker' }
        })
    }, requestId, apiKey);
}

async function addMessageToThread(threadId, content, requestId, apiKey) {
    return fetchAPI(`/threads/${threadId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
            role: 'user',
            content
        })
    }, requestId, apiKey);
}

async function runAssistant(threadId, assistantId, requestId, apiKey) {
    return fetchAPI(`/threads/${threadId}/runs`, {
        method: 'POST',
        body: JSON.stringify({
            assistant_id: assistantId
        })
    }, requestId, apiKey);
}

async function checkRunStatus(threadId, runId, requestId, apiKey) {
    return fetchAPI(`/threads/${threadId}/runs/${runId}`, {}, requestId, apiKey);
}

async function getMessages(threadId, requestId, apiKey) {
    return fetchAPI(`/threads/${threadId}/messages`, {}, requestId, apiKey);
}

export async function analyzeText(text, analysisType, requestId, env) {
    if (!env?.OPENAI_API_KEY) {
        log(requestId, 'Missing OPENAI_API_KEY in environment');
        throw new Error('OpenAI API key not configured');
    }

    const startTime = Date.now();
    const type = analysisType.toLowerCase();
    const apiKey = env.OPENAI_API_KEY;
    
    try {
        if (!config.api.openai.assistants[type]) {
            throw new Error(`Invalid analysis type: ${analysisType}`);
        }

        log(requestId, `Starting ${type} analysis`);
        
        let threadId = activeThreads.get(type);
        
        if (!threadId) {
            log(requestId, `Creating new thread for ${type}`);
            const thread = await createThread(requestId, apiKey);
            threadId = thread.id;
            activeThreads.set(type, threadId);
        }

        log(requestId, `Adding message to thread ${threadId}`);
        await addMessageToThread(threadId, text, requestId, apiKey);
        
        log(requestId, 'Starting assistant run');
        const run = await runAssistant(threadId, config.api.openai.assistants[type], requestId, apiKey);
        
        log(requestId, 'Polling for completion');
        let runStatus = await checkRunStatus(threadId, run.id, requestId, apiKey);
        let pollCount = 0;
        
        while (!['completed', 'failed', 'cancelled'].includes(runStatus.status)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await checkRunStatus(threadId, run.id, requestId, apiKey);
            pollCount++;

            if (pollCount % 5 === 0) {
                log(requestId, `Still polling (attempt ${pollCount})`);
            }
        }

        if (runStatus.status !== 'completed') {
            throw new Error(`Run failed with status: ${runStatus.status}`);
        }
        
        const messages = await getMessages(threadId, requestId, apiKey);
        const assistantMessage = messages.data.find(m => m.role === 'assistant');
        
        if (!assistantMessage?.content?.[0]) {
            throw new Error('No valid response from assistant');
        }

        const duration = Date.now() - startTime;
        log(requestId, `Analysis completed`, {
            type: type,
            duration: `${duration}ms`,
            pollCount
        });

        return assistantMessage.content[0].text.value;

    } catch (error) {
        log(requestId, `Analysis error: ${error.message}`);
        throw error;
    }
}