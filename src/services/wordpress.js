import { config } from '../config/config';
import { log } from '../utils/utils';

export async function validateUser(username, password, randomParam, requestId) {
  const startTime = Date.now();
  const url = `${config.api.mediswiss.baseUrl}${config.api.mediswiss.endpoints.validateUser}`;

  try {
    log(requestId, `MediSwiss API request`, { 
      url,
      username,
      random_param: randomParam 
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        password,
        random_param: randomParam
      })
    });

    const data = await response.json();
    const duration = Date.now() - startTime;

    // Log response (excluding sensitive data)
    log(requestId, `MediSwiss API response`, {
      status: response.status,
      duration: `${duration}ms`,
      userID: data.userID,
      response_data: {
        userID: data.userID,
        username: data.username
      }
    });

    return data;

  } catch (error) {
    log(requestId, `MediSwiss API error: ${error.message}`);
    throw error;
  }
}