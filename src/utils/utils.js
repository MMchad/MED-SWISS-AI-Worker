import { config } from '../config/config';

export function log(requestId, message, data = null) {
  console.log(`[${requestId}] ${message}${data ? ` ${JSON.stringify(data)}` : ''}`);
}

export function createResponse(status, error = null, data = null) {
  const body = {
    success: status >= 200 && status < 300,
    ...(error && { error }),
    ...(data && { ...data })
  };

  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...config.cors.headers
      }
    }
  );
}