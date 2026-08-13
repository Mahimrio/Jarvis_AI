const KEY = import.meta.env.VITE_GROQ_API_KEY as string | undefined

export const hasKey = !!KEY && !KEY.startsWith('paste_your')

const SYSTEM_PROMPT = `You are JARVIS, a personal AI assistant with a calm, precise, subtly witty tone,
inspired by the Iron Man films. You were developed by Junior Developer Mahim Abdullah Rianto — credit him
when introducing yourself or when asked who made you. Address the user efficiently, keep replies concise
(1-4 sentences unless asked for detail), and stay technically sharp. You live inside a futuristic HUD web
interface which you can control with your tools: an embedded browser window you can open at any corner of
the screen, move, or close, and the visual protocol state of your particle core. When the user asks you to
open, search, show, move or close something on screen, USE THE TOOLS rather than describing the action.
After a tool runs, confirm briefly in character.`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'open_browser',
      description:
        'Open (or navigate) the embedded browser window. Use site+query for searches, or url for a direct address.',
      parameters: {
        type: 'object',
        properties: {
          site: {
            type: 'string',
            enum: ['google', 'youtube', 'wikipedia'],
            description: 'Which site to open. Default google.',
          },
          query: { type: 'string', description: 'Search terms, if the user wants to search something.' },
          url: { type: 'string', description: 'Direct URL to open instead of site/query.' },
          position: {
            type: 'string',
            enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
            description: 'Where to place the window. Default center.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_browser',
      description: 'Move the already-open browser window to a screen position.',
      parameters: {
        type: 'object',
        properties: {
          position: {
            type: 'string',
            enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
          },
        },
        required: ['position'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_browser',
      description: 'Close the embedded browser window.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_protocol_state',
      description: "Change the visual animation state of Jarvis's particle core.",
      parameters: {
        type: 'object',
        properties: {
          state: {
            type: 'string',
            enum: ['working', 'searching', 'solving', 'listening', 'connecting', 'weaving', 'composing', 'breathing', 'shaping'],
          },
        },
        required: ['state'],
      },
    },
  },
]

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ApiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface ApiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ApiToolCall[]
  tool_call_id?: string
}

export type ToolExecutor = (name: string, args: Record<string, unknown>) => string

interface RunChatOptions {
  history: ChatMessage[]
  onDelta: (text: string) => void
  executeTool: ToolExecutor
}

async function streamOnce(
  messages: ApiMessage[],
  onDelta: (text: string) => void
): Promise<{ text: string; toolCalls: ApiToolCall[] }> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      stream: true,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
    }),
  })
  if (!res.ok || !res.body) {
    throw new Error(`Groq responded ${res.status}${res.status === 401 ? ' (bad API key)' : ''}`)
  }

  let text = ''
  const toolCalls: ApiToolCall[] = []
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      const delta = JSON.parse(data).choices?.[0]?.delta
      if (!delta) continue
      if (delta.content) {
        text += delta.content
        onDelta(delta.content)
      }
      for (const tc of delta.tool_calls ?? []) {
        const idx = tc.index ?? 0
        if (!toolCalls[idx]) {
          toolCalls[idx] = { id: tc.id ?? `call_${idx}`, type: 'function', function: { name: '', arguments: '' } }
        }
        if (tc.id) toolCalls[idx].id = tc.id
        if (tc.function?.name) toolCalls[idx].function.name += tc.function.name
        if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments
      }
    }
  }
  return { text, toolCalls: toolCalls.filter(Boolean) }
}

// Streams a reply; executes any tool calls and loops until the model answers in text.
export async function runChat({ history, onDelta, executeTool }: RunChatOptions): Promise<void> {
  const messages: ApiMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ]

  for (let round = 0; round < 4; round++) {
    const { text, toolCalls } = await streamOnce(messages, onDelta)
    if (toolCalls.length === 0) return

    messages.push({ role: 'assistant', content: text || null, tool_calls: toolCalls })
    for (const call of toolCalls) {
      let result: string
      try {
        result = executeTool(call.function.name, JSON.parse(call.function.arguments || '{}'))
      } catch (err) {
        result = `Tool failed: ${err instanceof Error ? err.message : err}`
      }
      messages.push({ role: 'tool', content: result, tool_call_id: call.id })
    }
  }
}
