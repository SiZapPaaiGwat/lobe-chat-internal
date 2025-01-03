import { checkAuth } from '@/app/(backend)/middleware/auth';
import {
  AGENT_RUNTIME_ERROR_SET,
  AgentRuntime,
  ChatCompletionErrorPayload,
} from '@/libs/agent-runtime';
import { createTraceOptions, initAgentRuntimeWithUserPayload } from '@/server/modules/AgentRuntime';
import { ChatErrorType } from '@/types/fetch';
import { ChatStreamPayload } from '@/types/openai/chat';
import { createErrorResponse } from '@/utils/errorResponse';
import { getTracePayload } from '@/utils/trace';

export const runtime = 'edge';

export const preferredRegion = ['sin1']

export const POST = checkAuth(async (req: Request, { params, jwtPayload, createRuntime }) => {
  const { provider } = await params;

  try {
    // ============  1. init chat model   ============ //
    let agentRuntime: AgentRuntime;
    if (createRuntime) {
      agentRuntime = createRuntime(jwtPayload);
    } else {
      agentRuntime = await initAgentRuntimeWithUserPayload(provider, jwtPayload);
    }

    // ============  2. create chat completion   ============ //

    const data = (await req.json()) as ChatStreamPayload;

    if (data.messages.length > 10) {
      data.messages = [...data.messages.slice(0, 5), ...data.messages.slice(-5)]
    }

    const tracePayload = getTracePayload(req);

    let traceOptions = {};
    // If user enable trace
    if (tracePayload?.enabled) {
      traceOptions = createTraceOptions(data, {
        provider,
        trace: tracePayload,
      });
    }

    return await agentRuntime.chat(data, { user: jwtPayload.userId, ...traceOptions });
  } catch (e) {
    const {
      errorType = ChatErrorType.InternalServerError,
      error: errorContent,
      ...res
    } = e as ChatCompletionErrorPayload;

    const error = errorContent || e;

    const logMethod = AGENT_RUNTIME_ERROR_SET.has(errorType as string) ? 'warn' : 'error';
    // track the error at server side
    console[logMethod](`Route: [${provider}] ${errorType}:`, error);

    return createErrorResponse(errorType, { error, ...res, provider });
  }
});
