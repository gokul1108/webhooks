import express from 'express';
import { DEFAULT_PORT } from './config/env';
import { listTaskMessages, sendRequest } from './utils/manus';
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNonDriveImageUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  return !/drive\.google\.com/i.test(value);
};

const extractFromString = (value: string): string | null => {
  const urlMatch = value.match(/https?:\/\/[^\s"'<>]+/i);
  if (!urlMatch) {
    return null;
  }

  const candidate = urlMatch[0];
  if (
    /drive\.google\.com/i.test(candidate) ||
    /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(candidate)
  ) {
    return candidate;
  }

  return null;
};

const extractAssistantImageUrl = (input: unknown): string | null => {
  const queue: unknown[] = [input];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (!isObject(current)) {
      continue;
    }

    const roleLike = current.role ?? current.sender ?? current.author ?? current.message_role;
    const isAssistant = roleLike === 'assistant';

    if (isAssistant) {
      const type = current.type;
      const url = current.url ?? current.image_url ?? current.imageUrl;
      if (type === 'image' && isNonDriveImageUrl(url)) {
        return url;
      }

      const content = current.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (!isObject(item)) {
            continue;
          }

          const itemType = item.type;
          const itemUrl = item.url ?? item.image_url ?? item.imageUrl;
          if (itemType === 'image' && isNonDriveImageUrl(itemUrl)) {
            return itemUrl;
          }
        }
      }
    }

    const assistantMessage = current.assistant_message;
    if (isObject(assistantMessage)) {
      const attachments = assistantMessage.attachments;
      if (Array.isArray(attachments)) {
        for (const attachment of attachments) {
          if (!isObject(attachment)) {
            continue;
          }

          const attachmentType = attachment.type;
          const attachmentUrl = attachment.url;
          if (attachmentType === 'image' && isNonDriveImageUrl(attachmentUrl)) {
            return attachmentUrl;
          }
        }
      }
    }

    queue.push(...Object.values(current));
  }

  return null;
};

const extractFinalImageUrl = (input: unknown): string | null => {
  const assistantImageUrl = extractAssistantImageUrl(input);
  if (assistantImageUrl) {
    return assistantImageUrl;
  }

  const queue: unknown[] = [input];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (typeof current === 'string') {
      const url = extractFromString(current);
      if (url && isNonDriveImageUrl(url)) {
        return url;
      }

      try {
        const parsed = JSON.parse(current);
        queue.push(parsed);
      } catch {
        // Ignore non-JSON strings.
      }
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (!isObject(current)) {
      continue;
    }

    const directImageUrl =
      current.image_url ?? current.imageUrl ?? current.final_image_url ?? current.finalImageUrl;
    if (isNonDriveImageUrl(directImageUrl)) {
      return directImageUrl;
    }

    queue.push(...Object.values(current));
  }

  return null;
};

const extractTaskId = (input: unknown): string | null => {
  const queue: unknown[] = [input];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (!isObject(current)) {
      continue;
    }

    const taskId = current.task_id ?? current.taskId;
    if (typeof taskId === 'string' && taskId.length > 0) {
      return taskId;
    }

    const id = current.id;
    const type = current.type;
    if (typeof id === 'string' && id.length > 0 && (type === 'task' || current.task)) {
      return id;
    }

    queue.push(...Object.values(current));
  }

  return null;
};

const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const taskWebhookCache = new Map<string, unknown>();

const waitForTaskOutput = async ({
  taskId,
  timeoutMs,
  intervalMs,
}: {
  taskId: string;
  timeoutMs: number;
  intervalMs: number;
}): Promise<{ messages: unknown; finalImageUrl: string | null }> => {
  const start = Date.now();
  let latestMessages: unknown = null;

  while (Date.now() - start < timeoutMs) {
    latestMessages = await listTaskMessages({ taskId, order: 'desc', limit: 20 });
    const finalImageUrl =
      extractAssistantImageUrl(latestMessages) ?? extractFinalImageUrl(latestMessages);
    if (finalImageUrl) {
      return { messages: latestMessages, finalImageUrl };
    }

    await delay(intervalMs);
  }

  return {
    messages: latestMessages,
    finalImageUrl: extractFinalImageUrl(latestMessages),
  };
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/webhook',(req,res)=>{
  console.log('Received webhook:', req.body);
  const taskId = extractTaskId(req.body);
  if (taskId) {
    taskWebhookCache.set(taskId, req.body);
  }

  return res.status(200).json({ message: 'Webhook received', taskId });
});

app.post('/manus/start', async (req, res) => {
  try {
    const message = req.body?.message;
    if (typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message is required' });
    }

    const taskResponse = await sendRequest({ message });
    const taskId = extractTaskId(taskResponse);
    return res.json({
      taskId,
      taskResponse,
    });
  } catch (error) {
    console.error('Failed to start Manus task:', error);
    return res.status(502).json({ error: 'Failed to start Manus task' });
  }
});

app.get('/manus/:taskId/messages', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const limitValue = Number(req.query.limit);
    const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.floor(limitValue) : 20;
    const order = req.query.order === 'asc' ? 'asc' : 'desc';

    const messages = await listTaskMessages({ taskId, order, limit });
    const webhookPayload = taskWebhookCache.get(taskId) ?? null;
    const finalImageUrl =
      extractAssistantImageUrl(messages) ??
      extractAssistantImageUrl(webhookPayload) ??
      extractFinalImageUrl(messages) ??
      extractFinalImageUrl(webhookPayload);

    return res.json({
      taskId,
      imageUrl: finalImageUrl,
    });
  } catch (error) {
    console.error('Failed to fetch Manus messages:', error);
    return res.status(502).json({ error: 'Failed to fetch Manus messages' });
  }
});

app.post('/manus',async (req,res)=>{
  try {
    const body = req.body;
    const message = body?.message;
    const timeoutMsValue = Number(body?.timeoutMs);
    const timeoutMs = Number.isFinite(timeoutMsValue) && timeoutMsValue > 0 ? Math.floor(timeoutMsValue) : 90000;
    const pollIntervalMs = 3000;

    if (typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message is required' });
    }

    console.log('Received request to /manus:', body);
    const taskResponse = await sendRequest({ message });
    console.log('Response from Manus API:', taskResponse);

    const taskId = extractTaskId(taskResponse);
    if (!taskId) {
      const responseImageUrl = extractAssistantImageUrl(taskResponse) ?? extractFinalImageUrl(taskResponse);
      return res.json({
        taskId: null,
        imageUrl: responseImageUrl,
      });
    }

    const { finalImageUrl } = await waitForTaskOutput({
      taskId,
      timeoutMs,
      intervalMs: pollIntervalMs,
    });

    return res.json({
      taskId,
      imageUrl: finalImageUrl,
    });
  } catch (error) {
    console.error('Failed to process /manus request:', error);
    return res.status(502).json({ error: 'Failed to process Manus task' });
  }
});




app.listen(DEFAULT_PORT, () => {
  console.log(`Server listening on port ${DEFAULT_PORT}`);
});
