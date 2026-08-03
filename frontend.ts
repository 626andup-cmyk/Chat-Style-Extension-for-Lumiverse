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
  // Input bar action (toggle button, doubles as a live counter via its
  // label) + a chromeless float widget for the actual compose panel.
  // Confirmed against docs.lumiverse.chat/frontend-api/ui-placement/
  // ---------------------------------------------------------------------
  ctx.dom.addStyle(`
    .mm-panel {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      background: var(--lumiverse-surface, #1e1e2a);
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    }
    .mm-panel textarea {
      min-height: 70px;
      resize: vertical;
    }
    .mm-queue-list {
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

  const widget = ctx.ui.createFloatWidget({
    width: 280,
    height: 340,
    initialPosition: { x: 100, y: 400 },
    snapToEdge: true,
    tooltip: 'Multi-Message Queue',
    chromeless: true, // extension owns all styling inside widget.root
  })
  widget.setVisible(false)

  widget.root.innerHTML = `
    <div class="mm-panel">
      <textarea id="mm-compose" placeholder="Type a message chunk..."></textarea>
      <div id="mm-queue-list" class="mm-queue-list"></div>
      <button id="mm-add">Add to queue</button>
      <button id="mm-flush">Send queue</button>
    </div>
  `

  const composeBox = widget.root.querySelector('#mm-compose') as HTMLTextAreaElement
  const listEl = widget.root.querySelector('#mm-queue-list') as HTMLDivElement

  const action = ctx.ui.registerInputBarAction({
    id: 'mm-queue-toggle',
    label: 'Queue',
    enabled: true,
  })

  function updateBadge() {
    action.setLabel(queue.length > 0 ? `Queue (${queue.length})` : 'Queue')
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

  widget.root.querySelector('#mm-add')?.addEventListener('click', () => {
    const text = composeBox.value.trim()
    if (!text) return
    queue.push(text)
    composeBox.value = ''
    updateBadge()
    resetFallback()
  })

  widget.root.querySelector('#mm-flush')?.addEventListener('click', () => flush())

  const unsubAction = action.onClick(() => {
    widget.setVisible(!widget.isVisible())
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
    unsubAction()
    action.destroy()
    widget.destroy()
    if (fallbackTimer) clearTimeout(fallbackTimer)
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}
