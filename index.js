/**
 * Lumiverse Symmetrical Multi-Message Simulator
 * Core test script compiled for local in-app directory imports.
 */

class MultiMessageSimulationPlugin {
    constructor() {
        this.messageBuffer = [];
        this.fallbackTimer = null;
        this.FALLBACK_DELAY = 30000; // 30-second countdown safety net
        
        this.BASE_DELAY_MS = 1500;
        this.PER_CHAR_DELAY_MS = 25;

        this.inputElement = null;
        this.sendButtonElement = null;

        console.log("[Multi-Message Sim] Initializing runtime hooks...");
        this.initDOMReferences();
        this.initListeners();
    }

    initDOMReferences() {
        this.inputElement = document.querySelector('#chat-input-textarea');
        this.sendButtonElement = document.querySelector('#chat-send-button');
    }

    initListeners() {
        if (!this.inputElement) return;

        // Monitor typing activity to pause the 30s timeout safety net while composing
        this.inputElement.addEventListener('input', () => {
            if (this.messageBuffer.length > 0) {
                this.resetFallbackTimer();
            }
            this.updateUIAppearance();
        });
    }

    /**
     * HOOK 1: Intercept User Transmissions
     */
    onBeforeSend(userRawInput) {
        if (!this.inputElement) return true;

        const cleanInput = userRawInput.trim();
        const hasTextInBox = this.inputElement.value.trim().length > 0;

        // SCENARIO A: Text exists in input field. Queue it locally.
        if (cleanInput.length > 0 && hasTextInBox) {
            this.queueUserMessage(cleanInput);
            this.inputElement.value = ''; // Empty text area for next thought bubble
            this.updateUIAppearance();
            return false; // Prevent Lumiverse from sending prompt instantly
        } 
        
        // SCENARIO B: Entry box is empty, but button was triggered (Manual Flush)
        if (this.messageBuffer.length > 0 && !hasTextInBox) {
            this.flushAndReleaseQueue();
            this.updateUIAppearance();
            return false; // Manually release prompt payload
        }

        return true;
    }

    queueUserMessage(text) {
        this.messageBuffer.push(text);
        
        // Push snappy simulated bubble onto current UI
        if (typeof Lumiverse !== 'undefined' && Lumiverse.UI) {
            Lumiverse.UI.renderLocalUserBubble(text);
        } else {
            console.log(`[Sim Bubble Render]: ${text}`);
        }

        this.resetFallbackTimer();
    }

    resetFallbackTimer() {
        if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
        
        this.fallbackTimer = setTimeout(() => {
            console.log("[Multi-Message Sim] 30s safety timeout hit. Auto-flushing queue.");
            this.flushAndReleaseQueue();
            this.updateUIAppearance();
        }, this.FALLBACK_DELAY);
    }

    flushAndReleaseQueue() {
        if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
        if (this.messageBuffer.length === 0) return;

        // Bundle array indices into a consolidated XML prompt string
        const finalPromptPayload = this.messageBuffer
            .map(msg => `<cht>${msg}</cht>`)
            .join('');

        this.messageBuffer = []; // Reset locally tracked storage array

        // Execute prompt injection bypass directly to API layer
        if (typeof Lumiverse !== 'undefined' && Lumiverse.API) {
            Lumiverse.API.executeLLMGeneration(finalPromptPayload);
        } else {
            console.log(`[Sim Final Sent Prompt]: ${finalPromptPayload}`);
        }
    }

    updateUIAppearance() {
        if (!this.sendButtonElement || !this.inputElement) return;

        const hasTextInBox = this.inputElement.value.trim().length > 0;
        const hasQueuedItems = this.messageBuffer.length > 0;

        // Apply visual flush alert state only if buffer contains items AND entry bar is empty
        if (hasQueuedItems && !hasTextInBox) {
            this.sendButtonElement.classList.add('flush-ready');
            this.sendButtonElement.setAttribute('data-queue-count', this.messageBuffer.length.toString());
        } else {
            this.sendButtonElement.classList.remove('flush-ready');
            this.sendButtonElement.removeAttribute('data-queue-count');
        }
    }

    /**
     * HOOK 2: Intercept Character Output Stream
     */
    onBeforeCharacterRender(rawResponseText) {
        const tagRegex = /<cht>([\s\S]*?)<\/cht>/g;
        const tagMatches = [...rawResponseText.matchAll(tagRegex)];

        // Plaintext safety fallback
        if (tagMatches.length === 0) {
            this.renderStaggeredOutput([rawResponseText.trim()]);
            return false; 
        }

        const characterMessageQueue = tagMatches.map(match => match[1].trim());
        this.renderStaggeredOutput(characterMessageQueue);

        return false; // Stop Lumiverse from showing raw text block with visible tags
    }

    async renderStaggeredOutput(messages) {
        if (typeof Lumiverse === 'undefined' || !Lumiverse.UI) return;

        // Freeze input frame to prevent typing collision bugs mid-generation sequence
        Lumiverse.UI.setChatInputDisabled(true);

        for (let i = 0; i < messages.length; i++) {
            const currentMsg = messages[i];
            
            Lumiverse.UI.showTypingIndicator(true);

            // Compute length-proportionate reading delay windows
            const generationDelay = this.BASE_DELAY_MS + (currentMsg.length * this.PER_CHAR_DELAY_MS);
            await new Promise(resolve => setTimeout(resolve, generationDelay));

            Lumiverse.UI.showTypingIndicator(false);
            Lumiverse.UI.renderCharacterBubble(currentMsg);

            // Brief delay gap between staggered bubbles
            if (i < messages.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 800));
            }
        }

        Lumiverse.UI.setChatInputDisabled(false);
    }
}

// Bind instance context natively to the main Lumiverse framework loader module
if (typeof Lumiverse !== 'undefined' && Lumiverse.Extensions) {
    Lumiverse.Extensions.register(new MultiMessageSimulationPlugin());
} else {
    window.multiMessageSimPlugin = new MultiMessageSimulationPlugin();
}
