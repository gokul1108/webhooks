import { systemPrompt } from "../config/prompt";
const MANUS_BASE_URL = 'https://api.manus.ai/v2';

const getHeaders = (): Record<string, string> => {
  const apiKey = process.env.MANUS_API_KEY ?? '';
  return {
    'Content-Type': 'application/json',
    'x-manus-api-key': apiKey,
  };
};

const ensureOkResponse = async (response: Response): Promise<unknown> => {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Manus API error (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload;
};

export async function sendRequest({ message }: { message: string }): Promise<unknown> {
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
}
