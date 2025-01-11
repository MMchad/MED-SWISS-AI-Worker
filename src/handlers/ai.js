import { config } from '../config/config';
import { analyzeText } from '../services/openai';
import { createResponse, log } from '../utils/utils';

export async function handleAnalysis(request, env, requestId) {
  try {
    const { text, type, style = 'default' } = await request.json();

    // Validate input
    if (!text || !type) {
      return createResponse(400, 'Text and analysis type required');
    }

    if (!config.analysisTypes.includes(type)) {
      return createResponse(400, 'Invalid analysis type');
    }

    log(requestId, `Starting ${type} analysis`, { textLength: text.length, style });

    // Add style parameter to the text if provided
    const formattedText = style !== 'default' 
      ? `Style: ${style}\n\n${text}`
      : text;

    // Get analysis from OpenAI
    const result = await analyzeText(
      formattedText, 
      type, 
      env.OPENAI_API_KEY,
      requestId
    );

    log(requestId, `Analysis completed`, { 
      type, 
      resultLength: result.length 
    });

    return createResponse(200, null, { result });

  } catch (error) {
    log(requestId, `Analysis error: ${error.message}`);
    return createResponse(500, error.message);
  }
}

// Batch analysis handler
export async function handleBatchAnalysis(request, env, requestId) {
  try {
    const { text, types, style = 'default' } = await request.json();

    if (!text || !Array.isArray(types) || types.length === 0) {
      return createResponse(400, 'Text and analysis types required');
    }

    // Validate all analysis types
    if (types.some(type => !config.analysisTypes.includes(type))) {
      return createResponse(400, 'Invalid analysis type in batch request');
    }

    log(requestId, `Starting batch analysis`, { 
      types, 
      textLength: text.length,
      style 
    });

    // Add style parameter to the text if provided
    const formattedText = style !== 'default' 
      ? `Style: ${style}\n\n${text}`
      : text;

    // Process all analyses in parallel
    const results = await Promise.all(
      types.map(type => 
        analyzeText(formattedText, type, env.OPENAI_API_KEY, requestId)
      )
    );

    // Create result object with type as key
    const resultObject = types.reduce((acc, type, index) => ({
      ...acc,
      [type]: results[index]
    }), {});

    log(requestId, `Batch analysis completed`, { types });

    return createResponse(200, null, resultObject);

  } catch (error) {
    log(requestId, `Batch analysis error: ${error.message}`);
    return createResponse(500, error.message);
  }
}