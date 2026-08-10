import { llmRegistry } from '../llm/registry'
import type { MessageRole } from '../llm/types'

export type Intent =
  | 'code_execution'
  | 'file_operation'
  | 'download'
  | 'media'
  | 'conversation'

const SYSTEM_PROMPT = `You are an intent classifier for an AI execution platform.
Classify the user's prompt into exactly one of these intents:
- code_execution: user wants to run code, compute something, process data, automate a task IN A SANDBOX
- file_operation: user wants to read, write, upload, or manage files
- download: user wants to download a file from the internet
- media: user wants to process, play, or manage media (audio/video/images)
- conversation: general conversation, questions, explanations, OR any action on a connected external app

Respond with ONLY the intent name, nothing else.`

export async function classifyIntent(
  prompt: string,
  recentMessages: Array<{ role: string; content: string }>,
  model?: string,
  connectedApps?: string,
): Promise<Intent> {
  try {
    const llm = llmRegistry.getDefault()
    const appHint = connectedApps
      ? `The user has these external apps connected: ${connectedApps}. ` +
        'If the request is an ACTION on a connected app (e.g. creating/editing notes, pages, databases, ' +
        'tasks, records, or files in that app), classify it as "conversation" so the app tools handle it — ' +
        'do NOT classify such requests as code_execution. '
      : ''
    const response = await llm.generate({
      model,
      systemPrompt: SYSTEM_PROMPT + (appHint ? '\n\n' + appHint : ''),
      messages: [
        ...recentMessages.slice(-4).map((m) => ({
          role: (m.role === 'assistant' ? 'model' : 'user') as MessageRole,
          content: m.content,
        })),
        { role: 'user' as MessageRole, content: `Classify this: "${prompt}"` },
      ],
      temperature: 0,
      maxOutputTokens: 32,
    })

    const raw = response.content.trim().toLowerCase()
    const valid: Intent[] = ['code_execution', 'file_operation', 'download', 'media', 'conversation']
    return valid.includes(raw as Intent) ? (raw as Intent) : 'conversation'
  } catch {
    return 'conversation'
  }
}
