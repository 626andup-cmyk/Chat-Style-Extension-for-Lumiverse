declare const spindle: import('lumiverse-spindle-types').SpindleAPI

type FlushQueuePayload = {
  type: 'flush_queue'
  content: string
}

// Track the active chat ourselves — confirmed via docs.lumiverse.chat/backend-api/events/#chat-lifecycle.
// CHAT_SWITCHED fires on navigation (chatId is null when the user is back on
// the home screen); CHAT_CHANGED is for in-chat data/metadata changes and
// isn't what we want here.
let activeChatId: string | null = null
spindle.on('CHAT_SWITCHED', (payload: { chatId: string | null }) => {
  activeChatId = payload.chatId
})

spindle.onFrontendMessage(async (payload: FlushQueuePayload, _userId) => {
  if (payload?.type !== 'flush_queue') return
  if (!payload.content) return
  if (!activeChatId) {
    spindle.log.warn('[Multi-Message Sim] Flush requested with no active chat — dropping.')
    return
  }

  // Appends the combined <cht>-tagged message as a normal user turn AND
  // triggers Lumiverse's standard generation pipeline (full chat history,
  // character card, world info — the same path the native send button uses).
  // Confirmed against docs.lumiverse.chat/backend-api/chat-mutation/
  const result = await spindle.chat.appendMessage(
    activeChatId,
    { role: 'user', content: payload.content },
    { triggerGeneration: true },
  )

  return result // { id, generationId }
})
