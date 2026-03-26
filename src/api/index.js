const API_BASE = '/api'

async function fetchWithError(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  return response.json()
}

export const api = {
  // Conversations
  getConversations: () => fetchWithError('/conversations'),

  createConversation: () => fetchWithError('/conversations', { method: 'POST' }),

  getConversation: (id) => fetchWithError(`/conversations/${id}`),

  renameConversation: (id, title) =>
    fetchWithError(`/conversations/${id}/title`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),

  autoRenameConversation: (id) =>
    fetchWithError(`/conversations/${id}/auto-rename`, { method: 'POST' }),

  deleteConversation: (id) =>
    fetchWithError(`/conversations/${id}`, { method: 'DELETE' }),

  // Search all conversations for a query
  searchConversations: (query) =>
    fetchWithError(`/conversations/search?q=${encodeURIComponent(query)}`),

  // Streaming chat using fetch with ReadableStream and SSE
  sendMessageStreamFetch: (conversationId, message, callbacks, resume = false, tempAssistantMsgId = null) => {
    const { onChunk, onThinking, onDone, onError, onStart, signal } = callbacks
    let streamingMessageId = null
    let fullContent = ''
    let fullThinking = ''
    let title = null
    let isAborted = false

    if (signal) {
      signal.addEventListener('abort', () => {
        isAborted = true
      })
    }

    const promise = fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, message, resume }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        function processBuffer() {
          if (isAborted) return true

          // Split by newlines
          const lines = buffer.split('\n')
          buffer = lines.pop() // Keep the last incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.type === 'start') {
                  streamingMessageId = data.message_id
                  title = data.title
                  onStart?.({ message_id: streamingMessageId, title, tempAssistantMsgId })
                } else if (data.type === 'chunk') {
                  fullContent += data.text
                  onChunk?.(data.text, fullContent)
                } else if (data.type === 'thinking') {
                  fullThinking += data.thinking
                  onThinking?.(fullThinking)
                } else if (data.type === 'done') {
                  onDone?.({ message_id: data.message_id, title: data.title, content: fullContent, thinking: fullThinking })
                  return true // Stream complete
                } else if (data.type === 'error') {
                  onError?.(data.error)
                  return true
                } else if (data.type === 'stopped') {
                  onDone?.({ message_id: streamingMessageId, title, content: fullContent, thinking: fullThinking, stopped: true })
                  return true
                }
              } catch (e) {
                // Ignore parse errors for incomplete JSON
              }
            }
          }
          return false
        }

        function read() {
          if (isAborted) return

          return reader.read().then(({ done, value }) => {
            if (done) {
              if (buffer) {
                processBuffer()
              }
              return
            }

            buffer += decoder.decode(value, { stream: true })
            const complete = processBuffer()
            if (!complete && !done && !isAborted) {
              return read()
            }
          })
        }

        return read()
      })
      .catch((error) => {
        if (!isAborted) {
          onError?.(error.message)
        }
      })

    return {
      abort: () => {
        isAborted = true
        if (signal) signal.dispatchEvent(new Event('abort'))
      },
      promise,
    }
  },

  regenerateResponse: (conversationId, messageId) =>
    fetchWithError('/chat/regenerate', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: conversationId, message_id: messageId }),
    }),

  stopGeneration: (conversationId) =>
    fetchWithError(`/chat/stop/${conversationId}`, { method: 'POST' }),
}
