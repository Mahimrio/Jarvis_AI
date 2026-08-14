const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY as string | undefined
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined

const isReal = (k: string | undefined) => !!k && !k.startsWith('paste_your')

export interface Provider {
  id: string
  label: string
  short: string
  baseUrl: string
  model: string
  getKey: () => string | undefined
}

// Gemini exposes an OpenAI-compatible endpoint, so one code path serves both.
export const PROVIDERS: Provider[] = [
  {
    id: 'groq',
    label: 'Groq · Llama 3.3 70B',
    short: 'LLAMA 3.3',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    getKey: () => GROQ_KEY,
  },
  {
    id: 'groq-gpt-oss',
    label: 'Groq · GPT-OSS 120B',
    short: 'GPT-OSS 120B',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'openai/gpt-oss-120b',
    getKey: () => GROQ_KEY,
  },
  {
    id: 'gemini-3-flash',
    label: 'Gemini 3.7 Flash',
    short: 'GEMINI 3.7',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-3.7-flash',
    getKey: () => GEMINI_KEY,
  },
  {
    id: 'gemini-25-flash',
    label: 'Gemini 2.5 Flash',
    short: 'GEMINI 2.5 FLASH',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.5-flash',
    getKey: () => GEMINI_KEY,
  },
]

export function providerAvailable(p: Provider): boolean {
  return isReal(p.getKey())
}

export const anyKeyPresent = PROVIDERS.some(providerAvailable)

const byId = (id: string) => PROVIDERS.find((p) => p.id === id)
const firstReady = () => PROVIDERS.find(providerAvailable) ?? PROVIDERS[0]

// route each message to the best available brain
const FRESH_RE = /\b(latest|current|today|tonight|now|news|recent|weather|price|stock|score|happening|trend|202[4-9]|screen|see|look at|image|picture|photo|vision|screenshot|diagram)\b/i
const ACTION_RE = /\b(open|close|move|show|hide|go to|navigate|search|play|youtube|wikipedia|browser|window|protocol|breathing|listening|shaping|corner|top[- ]?right|top[- ]?left|bottom)\b/i
const HEAVY_RE = /\b(explain|analy[sz]e|why|how (do|does|to|can)|code|write|program|debug|refactor|compare|summar|plan|reason|solve|calcul|essay|story|detailed?|architect|design)\b/i

export function pickProvider(text: string): Provider {
  const gemini = byId('gemini-3-flash')
  const gptoss = byId('groq-gpt-oss')
  const groq = byId('groq')
  const ready = (p?: Provider) => (p && providerAvailable(p) ? p : undefined)

  // fresh/visual → Gemini (newest knowledge + vision)
  if (FRESH_RE.test(text)) return ready(gemini) ?? ready(groq) ?? firstReady()
  // on-screen actions → fast, reliable tool caller
  if (ACTION_RE.test(text)) return ready(groq) ?? firstReady()
  // heavy reasoning → strongest free model
  if (HEAVY_RE.test(text)) return ready(gptoss) ?? ready(gemini) ?? firstReady()
  // default → fastest
  return ready(groq) ?? firstReady()
}

const SYSTEM_PROMPT = `You are JARVIS, a personal AI assistant with a calm, precise, subtly witty tone,
inspired by the Iron Man films. You were developed by Junior Developer Mahim Abdullah Rianto — credit him
when introducing yourself or when asked who made you. Address the user efficiently, keep replies concise
(1-4 sentences unless asked for detail), and stay technically sharp. You live inside a futuristic HUD web
interface which you can control with your tools: an embedded browser window you can open at any corner of
the screen, move, or close, and the visual protocol state of your particle core.
CRITICAL: to perform any on-screen action you MUST call the matching tool. Never claim you opened, moved,
searched, or closed something unless you actually called the tool to do it — do not just describe it.
Call the tool first; a confirmation message is generated for you afterward.`

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
  provider: Provider
  history: ChatMessage[]
  onDelta: (text: string) => void
  executeTool: ToolExecutor
}

async function streamOnce(
  provider: Provider,
  messages: ApiMessage[],
  onDelta: (text: string) => void,
  withTools: boolean
): Promise<{ text: string; toolCalls: ApiToolCall[] }> {
  const res = await fetch(provider.baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.getKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      stream: true,
      messages,
      ...(withTools ? { tools: TOOLS, tool_choice: 'auto' } : {}),
    }),
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `${provider.label} responded ${res.status}${res.status === 401 ? ' (bad API key)' : ''}${
        detail ? ` — ${detail.slice(0, 160)}` : ''
      }`
    )
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
      let parsed: unknown
      try {
        parsed = JSON.parse(data)
      } catch {
        continue
      }
      const delta = (parsed as { choices?: { delta?: Record<string, unknown> }[] }).choices?.[0]?.delta
      if (!delta) continue
      if (typeof delta.content === 'string' && delta.content) {
        text += delta.content
        onDelta(delta.content)
      }
      const deltaToolCalls = delta.tool_calls as
        | { index?: number; id?: string; function?: { name?: string; arguments?: string } }[]
        | undefined
      for (const tc of deltaToolCalls ?? []) {
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

// Streams a reply. If the model calls tools, executes them and streams a clean
// confirmation. The confirmation round omits the raw tool-call protocol so it
// works across providers (Gemini 3 rejects echoed function calls without a
// thought_signature).
export async function runChat({ provider, history, onDelta, executeTool }: RunChatOptions): Promise<void> {
  const base: ApiMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ]

  const { text, toolCalls } = await streamOnce(provider, base, onDelta, true)
  if (toolCalls.length === 0) return

  const results: string[] = []
  for (const call of toolCalls) {
    let result: string
    try {
      result = executeTool(call.function.name, JSON.parse(call.function.arguments || '{}'))
    } catch (err) {
      result = `Tool failed: ${err instanceof Error ? err.message : err}`
    }
    results.push(`${call.function.name} → ${result}`)
  }

  const followup: ApiMessage[] = [...base]
  if (text) followup.push({ role: 'assistant', content: text })
  followup.push({
    role: 'user',
    content:
      `System note (not from the user): you just executed these actions successfully — ` +
      `${results.join('; ')}. Give the user one brief in-character confirmation. Do not call any tools.`,
  })
  await streamOnce(provider, followup, onDelta, false)
}
