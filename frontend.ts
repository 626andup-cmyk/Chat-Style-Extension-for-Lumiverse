import type { SpindleFrontendContext } from 'lumiverse-spindle-types'

// ---- Tunables (match the original design pitch) ----
const FALLBACK_DELAY_MS = 30000 // 30s auto-flush if the timer isn't manually triggered
const BASE_DELAY_MS = 1500 // base pause before revealing a staggered <cht> chunk
const PER_CHAR_DELAY_MS = 25 // extra pause scaled by chunk length
const GAP_BETWEEN_BUBBLES_MS = 800 // pause between staggered sub-bubbles

export function setup(ctx: SpindleFrontendContext) {
  const queue: string[] = []
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null

  // Active-chat tracking now lives in the backend (via the confirmed
  // CHAT_SWITCHED event), so the frontend just fires the flush and doesn't
  // need to know or send a chatId itself.

  // ---------------------------------------------------------------------
  // Extension-owned input-bar button + popover composer
  // ---------------------------------------------------------------------
  const button = ctx.dom.createElement('button', { type: 'button', id: 'mm-queue-btn' })
  button.textContent = 'Queue'

  const panel = ctx.dom.createElement('div', { id: 'mm-panel' })
  panel.innerHTML = `
    <textarea id="mm-compose" placeholder="Type a message chunk..."></textarea>
    <div id="mm-queue-list"></div>
    <button id="mm-add">Add to queue</button>
    <button id="mm-flush">Send queue</button>
  `
  panel.style.display = 'none'

  ctx.dom.addStyle(`
    #mm-queue-btn {
      position: relative;
    }
    #mm-queue-btn[data-count]:not([data-count="0"]) {
      background: linear-gradient(135deg, #6366f1, #a855f7) !important;
      box-shadow: 0 0 14px rgba(168, 85, 247, 0.5);
    }
    #mm-queue-btn[data-count]:not([data-count="0"])::after {
      content: attr(data-count);
      position: absolute;
      top: -5px;
      right: -5px;
      background-color: #ef4444;
      color: #ffffff;
      font-size: 0.7rem;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 9999px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      z-index: 10;
    }
    #mm-panel {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px;
    }
    #mm-panel textarea {
      min-height: 60px;
      resize: vertical;
    }
    #mm-queue-list {
      font-size: 0.8rem;
      opacity: 0.8;
      max-height: 100px;
      overflow-y: auto;
    }
    .staggered-bubble {
      margin-top: 6px;
      padding: 8px 12px;
      border-radius: var(--lumiverse-radius, 12px);
      background: var(--lumiverse-fill-subtle);
      color: var(--lumiverse-text);
      animation: staggered-fade-in 0.25s ease-in-out;
    }
    @keyframes staggered-fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `)

  // Placement id 'input-bar' — verify against docs.lumiverse.chat/frontend-api/ui-placement/
  const root = ctx.ui.mount('input-bar')
  root.appendChild(button)
  root.appendChild(panel)

  const composeBox = panel.querySelector('#mm-compose') as HTMLTextAreaElement
  const listEl = panel.querySelector('#mm-queue-list') as HTMLDivElement

  function updateBadge() {
    button.setAttribute('data-count', String(queue.length))
    listEl.innerHTML = queue.map((msg, i) => `<div>${i + 1}. ${escapeHtml(msg)}</div>`).join('')
  }

  function resetFallback() {
    if (fallbackTimer) clearTimeout(fallbackTimer)
    fallbackTimer = setTimeout(flush, FALLBACK_DELAY_MS)
  }

  // Typing pauses/extends the 30s timer, per the original spec
  composeBox.addEventListener('input', () => {
    if (queue.length > 0) resetFallback()
  })

  ctx.ui.events.bindActionHandlers(panel, {
    'mm-add': () => {
      const text = composeBox.value.trim()
      if (!text) return
      queue.push(text)
      composeBox.value = ''
      updateBadge()
      resetFallback()
    },
    'mm-flush': () => flush(),
  })

  ctx.ui.events.bindActionHandlers(root, {
    'mm-queue-btn': () => {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none'
    },
  })

  async function flush() {
    if (fallbackTimer) clearTimeout(fallbackTimer)
    if (queue.length === 0) return

    // Wrap each queued chunk in its own <cht> tag before sending
    const payload = queue.map((msg) => `<cht>${escapeHtml(msg)}</cht>`).join('')
    queue.length = 0
    updateBadge()

    ctx.sendToBackend({ type: 'flush_queue', content: payload })
  }

  // ---------------------------------------------------------------------
  // AI-side staggered <cht> tag rendering
  // ---------------------------------------------------------------------
  const unsubTag = ctx.messages.registerTagInterceptor(
    { tagName: 'cht', removeFromMessage: true },
    async (tagPayload: any) => {
      if (!tagPayload.messageId || tagPayload.isStreaming) return
      const bubble = ctx.dom.findMessageElement(tagPayload.messageId)
      if (!bubble) return

      const text = String(tagPayload.content ?? '').trim()
      if (!text) return

      const delay = BASE_DELAY_MS + text.length * PER_CHAR_DELAY_MS
      await new Promise((resolve) => setTimeout(resolve, delay))

      ctx.dom.inject(bubble, `<div class="staggered-bubble">${escapeHtml(text)}</div>`, 'beforeend')
      await new Promise((resolve) => setTimeout(resolve, GAP_BETWEEN_BUBBLES_MS))
    },
  )

  return () => {
    unsubTag()
    if (fallbackTimer) clearTimeout(fallbackTimer)
    ctx.dom.cleanup()
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}
