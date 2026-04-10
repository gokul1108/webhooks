import { systemPrompt } from "../config/prompt";
const MANUS_BASE_URL = 'https://api.manus.ai/v2';

const INVOCATION_ERROR_CODE = 'FUNCTION_INVOCATION_FAILED';

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const getHeaders = (): Record<string, string> => {
  const apiKey = process.env.MANUS_API_KEY ?? '';

  if (!apiKey) {
    throw new Error(`${INVOCATION_ERROR_CODE}: MANUS_API_KEY is missing`);
  }

  return {
    'Content-Type': 'application/json',
    'x-manus-api-key': apiKey,
  };
};

const ensureOkResponse = async (response: Response): Promise<unknown> => {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(
      `${INVOCATION_ERROR_CODE}: Invalid JSON response from Manus API (${response.status}) - ${toErrorMessage(error)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `${INVOCATION_ERROR_CODE}: Manus API error (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  return payload;
};

export async function sendRequest({ message }: { message: string }): Promise<unknown> {
  try {
    console.log('Sending request to Manus API with message:', message);
    const response = await fetch(`${MANUS_BASE_URL}/task.create`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        message: {
          content: [{ type: 'text', text: systemPrompt }, { type: 'text', text: message }],
        },
      }),
    });

    return ensureOkResponse(response);
  } catch (error) {
    throw new Error(
      `${INVOCATION_ERROR_CODE}: Failed to invoke task.create - ${toErrorMessage(error)}`
    );
  }
}

export async function listTaskMessages({
  taskId,
  order = 'desc',
  limit = 20,
}: {
  taskId: string;
  order?: 'asc' | 'desc';
  limit?: number;
}): Promise<unknown> {
  try {
    const query = new URLSearchParams({
      task_id: taskId,
      order,
      limit: String(limit),
    });

    const response = await fetch(`${MANUS_BASE_URL}/task.listMessages?${query.toString()}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    return ensureOkResponse(response);
  } catch (error) {
    throw new Error(
      `${INVOCATION_ERROR_CODE}: Failed to invoke task.listMessages - ${toErrorMessage(error)}`
    );
  }
}
