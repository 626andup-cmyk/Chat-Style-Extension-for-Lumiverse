// src/backend.ts
var activeChatId = null;
spindle.on("CHAT_SWITCHED", (payload) => {
  activeChatId = payload.chatId;
});
spindle.onFrontendMessage(async (payload, _userId) => {
  if (payload?.type !== "flush_queue") return;
  if (!payload.content) return;
  if (!activeChatId) {
    spindle.log.warn("[Multi-Message Sim] Flush requested with no active chat \u2014 dropping.");
    return;
  }
  const result = await spindle.chat.appendMessage(
    activeChatId,
    { role: "user", content: payload.content },
    { triggerGeneration: true }
  );
  return result;
});
