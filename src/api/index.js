import { apiBaseUrl } from '../config/runtime'

async function fetchWithError(url, options = {}) {
  const response = await fetch(`${apiBaseUrl}${url}`, {
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

  updateConversationFiles: (id, fileIds) =>
    fetchWithError(`/conversations/${id}/files`, {
      method: 'PATCH',
      body: JSON.stringify({ file_ids: fileIds }),
    }),

  deleteConversation: (id) =>
    fetchWithError(`/conversations/${id}`, { method: 'DELETE' }),

  // Search all conversations for a query
  searchConversations: (query) =>
    fetchWithError(`/conversations/search?q=${encodeURIComponent(query)}`),

  // Files
  getFiles: async () => {
    const res = await fetchWithError('/files')
    // Map backend field names to frontend expected names
    return (res.files || []).map(f => ({
      id: f.id,
      name: f.filename,
      type: f.file_type,
      size: f.size,
      uploaded_at: f.uploaded_at,
      status: f.status,
      progress: f.progress,
      error: f.error,
      chunk_count: f.chunk_count,
      text_preview: f.text_preview,
    }))
  },

  getFile: async (id) => {
    const f = await fetchWithError(`/files/${id}`)
    return {
      id: f.id,
      name: f.filename,
      type: f.file_type,
      size: f.size,
      uploaded_at: f.uploaded_at,
      status: f.status,
      progress: f.progress,
      error: f.error,
      chunk_count: f.chunk_count,
      text_preview: f.text_preview,
    }
  },

  getFile: (id) => fetchWithError(`/files/${id}`),

  uploadFile: async (file, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${apiBaseUrl}/files/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }

    return response.json()
  },

  deleteFile: (id) => fetchWithError(`/files/${id}`, { method: 'DELETE' }),

  // Load file embeddings into memory
  loadFile: (id) => fetchWithError(`/files/load/${id}`, { method: 'POST' }),

  loadAllFiles: () => fetchWithError('/files/load-all', { method: 'POST' }),

  unloadFile: (id) => fetchWithError(`/files/unload/${id}`, { method: 'POST' }),

  // Search files by semantic similarity
  searchFiles: (query, topK = 5) =>
    fetchWithError('/files/search', {
      method: 'POST',
      body: JSON.stringify({ query, top_k: topK }),
    }),

  // Get RAG contexts used for a specific message
  getMessageRagContexts: (conversationId, messageId) =>
    fetchWithError(`/conversations/${conversationId}/messages/${messageId}/rag-contexts`),

  // Streaming chat using fetch with ReadableStream and SSE
  sendMessageStreamFetch: (conversationId, message, callbacks, resume = false, tempAssistantMsgId = null, deepQAMode = false, multiModelMode = false) => {
    const { onChunk, onThinking, onDone, onError, onStart, signal } = callbacks
    let streamingMessageId = null
    let fullContent = ''
    let fullThinking = ''
    let title = null
    let isAborted = false
    let streamEndedNormally = false

    if (signal) {
      signal.addEventListener('abort', () => {
        isAborted = true
      })
    }

    const promise = fetch(`${apiBaseUrl}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, message, resume, deep_qa_mode: deepQAMode, multi_model: multiModelMode }),
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
                } else if (data.type === 'multi_start') {
                  streamingMessageId = data.message_id
                  title = data.title
                  onStart?.({ message_id: streamingMessageId, title, tempAssistantMsgId })
                  callbacks.onMultiStart?.({ message_id: data.message_id, title: data.title, models: data.models, version_map: data.version_map })
                } else if (data.type === 'model_done') {
                  callbacks.onModelDone?.(data.model, data.version_index)
                } else if (data.type === 'model_error') {
                  callbacks.onModelError?.(data.model, data.error)
                } else if (data.type === 'deep_qa_status') {
                  // Handle DeepQA processing status - call callback if provided
                  callbacks.onDeepQAStatus?.(data)
                } else if (data.type === 'chunk') {
                  if (data.model) {
                    callbacks.onMultiChunk?.(data.model, data.text)
                  } else {
                    fullContent += data.text
                    onChunk?.(data.text, fullContent)
                  }
                } else if (data.type === 'thinking') {
                  if (data.model) {
                    callbacks.onMultiThinking?.(data.model, data.thinking)
                  } else {
                    fullThinking += data.thinking
                    onThinking?.(fullThinking)
                  }
                } else if (data.type === 'done') {
                  streamEndedNormally = true
                  onDone?.({ message_id: data.message_id, title: data.title, content: fullContent, thinking: fullThinking })
                  return true // Stream complete
                } else if (data.type === 'error') {
                  streamEndedNormally = true
                  onError?.(data.error)
                  return true
                } else if (data.type === 'stopped') {
                  streamEndedNormally = true
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
              if (!streamEndedNormally && !isAborted) {
                onError?.('Stream ended unexpectedly')
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

  stopGeneration: (conversationId) =>
    fetchWithError(`/chat/stop/${conversationId}`, { method: 'POST' }),

  regenerateResponse: (conversationId, messageId) =>
    fetchWithError('/chat/regenerate', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: conversationId, message_id: messageId }),
    }),

  regenerateModel: (conversationId, messageId, model) =>
    fetchWithError('/chat/regenerate-model', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: conversationId, message_id: messageId, model }),
    }),

  selectMessageVersion: (messageId, conversationId, versionIndex) =>
    fetchWithError('/chat/message/' + messageId + '/select-version', {
      method: 'PATCH',
      body: JSON.stringify({ conversation_id: conversationId, version_index: versionIndex }),
    }),

  generateVersion: (messageId, conversationId) =>
    fetchWithError('/chat/message/' + messageId + '/versions', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: conversationId }),
    }),

  generateVersionStream: (messageId, conversationId, callbacks) => {
    const { onChunk, onThinking, onDone, onError, onStart, signal } = callbacks
    let isAborted = false
    let streamEndedNormally = false

    if (signal) {
      signal.addEventListener('abort', () => {
        isAborted = true
      })
    }

    const promise = fetch(`${apiBaseUrl}/chat/message/${messageId}/versions/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId }),
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

          const lines = buffer.split('\n')
          buffer = lines.pop()

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.type === 'start') {
                  onStart?.({ version_index: data.version_index })
                } else if (data.type === 'chunk') {
                  onChunk?.(data.text)
                } else if (data.type === 'thinking') {
                  onThinking?.(data.thinking)
                } else if (data.type === 'done') {
                  streamEndedNormally = true
                  onDone?.(data)
                  return true
                } else if (data.type === 'error') {
                  streamEndedNormally = true
                  onError?.(data.error)
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
              if (!streamEndedNormally && !isAborted) {
                onError?.('Stream ended unexpectedly')
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

  // Model switch
  switchModel: (model) =>
    fetchWithError('/model/switch', {
      method: 'POST',
      body: JSON.stringify({ model }),
    }),

  // Model list
  getModels: () => fetchWithError('/model/list'),

  // Group Chat
  createGroupChat: (agentIds) =>
    fetchWithError('/group-chat/create', {
      method: 'POST',
      body: JSON.stringify({ agent_ids: agentIds }),
    }),

  getGroupChatAgents: () => fetchWithError('/group-chat/agents'),

  stopGroupChat: (conversationId) =>
    fetchWithError(`/group-chat/stop/${conversationId}`, { method: 'POST' }),

  sendGroupChatStream: (conversationId, message, callbacks) => {
    const { onRoundStart, onEvaluation, onAgentSpeaking, onChunk, onThinking, onAgentDone, onRoundEnd, onDone, onError, signal } = callbacks
    let isAborted = false
    let streamEndedNormally = false

    if (signal) {
      signal.addEventListener('abort', () => { isAborted = true })
    }

    const promise = fetch(`${apiBaseUrl}/group-chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, message }),
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

          const lines = buffer.split('\n')
          buffer = lines.pop()

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.type === 'round_start') {
                  onRoundStart?.(data.round)
                } else if (data.type === 'evaluation') {
                  onEvaluation?.(data)
                } else if (data.type === 'agent_speaking') {
                  onAgentSpeaking?.(data)
                } else if (data.type === 'chunk') {
                  onChunk?.(data.agent_id, data.text)
                } else if (data.type === 'thinking') {
                  onThinking?.(data.agent_id, data.thinking)
                } else if (data.type === 'agent_done') {
                  onAgentDone?.(data.agent_id)
                } else if (data.type === 'round_end') {
                  onRoundEnd?.(data.reason)
                } else if (data.type === 'done') {
                  streamEndedNormally = true
                  onDone?.()
                  return true
                } else if (data.type === 'stopped') {
                  streamEndedNormally = true
                  onDone?.({ stopped: true })
                  return true
                } else if (data.type === 'error') {
                  streamEndedNormally = true
                  onError?.(data.message || data.error)
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
              if (buffer) processBuffer()
              if (!streamEndedNormally && !isAborted) {
                onError?.('Stream ended unexpectedly')
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
}
