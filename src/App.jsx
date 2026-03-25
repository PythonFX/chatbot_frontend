import { useState, useEffect, useRef } from 'react'
import { Bot, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import Sidebar from './components/Sidebar'
import ChatMessage from './components/ChatMessage'
import MessageInput from './components/MessageInput'
import { api } from './api'

function StreamingCodeBlock({ language, codeString }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="rounded-lg overflow-hidden my-2 text-sm">
      <div className="bg-gray-800 px-3 py-1 text-gray-400 text-xs flex justify-between items-center">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors"
          title="Copy code"
        >
          {copied ? <><Check size={12} /><span>Copied!</span></> : <><Copy size={12} /><span>Copy</span></>}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: 0 }}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  )
}

export default function App() {
  const [conversations, setConversations] = useState([])
  const [currentConversation, setCurrentConversation] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingThinking, setStreamingThinking] = useState('')
  const [streamingMessageId, setStreamingMessageId] = useState(null)
  const messagesEndRef = useRef(null)
  const [renamingConversationId, setRenamingConversationId] = useState(null)
  const streamAbortRef = useRef(null) // Track ongoing stream request

  // Load conversations on mount and auto-select the latest
  useEffect(() => {
    loadConversations()
  }, [])

  // Auto-select latest conversation when conversations are loaded
  useEffect(() => {
    if (!currentConversation && conversations.length > 0) {
      const latestConv = conversations[0]
      api.getConversation(latestConv.id).then(conv => {
        setCurrentConversation(conv)
      })
    }
  }, [conversations.length])

  // Check if current conversation has incomplete message and set up streaming state
  useEffect(() => {
    if (currentConversation) {
      const incompleteMsg = currentConversation.messages.find(m => !m.complete && m.role === 'assistant')
      if (incompleteMsg) {
        setStreamingMessageId(incompleteMsg.id)
        setStreamingContent(incompleteMsg.content)
        setStreamingThinking(incompleteMsg.thinking || '')
        setIsGenerating(true)
      }
    }
  }, [currentConversation?.id])

  const loadConversations = async () => {
    try {
      const data = await api.getConversations()
      setConversations(data)
    } catch (err) {
      setError('Failed to load conversations: ' + err.message)
    }
  }

  const handleNewConversation = async () => {
    // Don't abort ongoing streams - let them finish in background
    // Clear streaming state for current conversation
    setStreamingContent('')
    setStreamingThinking('')
    setStreamingMessageId(null)
    setIsGenerating(false)

    try {
      const newConv = await api.createConversation()
      await loadConversations()
      setCurrentConversation({ ...newConv, messages: [] })
      setError(null)
    } catch (err) {
      setError('Failed to create conversation: ' + err.message)
    }
  }

  const handleSelectConversation = async (id) => {
    // Don't abort the stream when switching - let it finish in background
    // Just clear the local streaming UI state
    // The backend will continue and save the complete message
    streamAbortRef.current = null // We'll create new abort for new streams

    // Clear streaming state before loading new conversation
    setStreamingContent('')
    setStreamingThinking('')
    setStreamingMessageId(null)
    setIsGenerating(false)

    try {
      const conv = await api.getConversation(id)
      setCurrentConversation(conv)
      setError(null)
    } catch (err) {
      setError('Failed to load conversation: ' + err.message)
    }
  }

  const handleDeleteConversation = async (id) => {
    // Cancel stream if deleting the current conversation
    if (currentConversation?.id === id && streamAbortRef.current) {
      streamAbortRef.current.abort()
      streamAbortRef.current = null
    }

    try {
      await api.deleteConversation(id)
      await loadConversations()
      if (currentConversation?.id === id) {
        setCurrentConversation(null)
        setStreamingContent('')
        setStreamingThinking('')
        setStreamingMessageId(null)
      }
      setError(null)
    } catch (err) {
      setError('Failed to delete conversation: ' + err.message)
    }
  }

  const handleRenameConversation = async (id, newTitle) => {
    try {
      await api.renameConversation(id, newTitle)
      await loadConversations()
      if (currentConversation?.id === id) {
        setCurrentConversation((prev) => ({ ...prev, title: newTitle }))
      }
      setError(null)
    } catch (err) {
      setError('Failed to rename conversation: ' + err.message)
    }
  }

  const handleAutoRenameConversation = async (id) => {
    setRenamingConversationId(id)
    try {
      const updated = await api.autoRenameConversation(id)
      await loadConversations()
      if (currentConversation?.id === id) {
        setCurrentConversation((prev) => ({ ...prev, title: updated.title }))
      }
      setError(null)
    } catch (err) {
      setError('Failed to auto-rename conversation: ' + err.message)
    } finally {
      setRenamingConversationId(null)
    }
  }

  const handleSendMessage = async (message) => {
    if (!currentConversation) return

    const conversationId = currentConversation.id // Capture to avoid stale closure
    const conversationTitle = currentConversation.title

    setIsGenerating(true)
    setError(null)
    setStreamingContent('')
    setStreamingThinking('')
    setStreamingMessageId(null)

    // Create abort controller for this stream
    const abortController = new AbortController()
    streamAbortRef.current = abortController

    // Optimistically add user message
    const userMsgId = Date.now().toString()
    const userMsg = {
      id: userMsgId,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    }

    setCurrentConversation((prev) => ({
      ...prev,
      messages: [...prev.messages, userMsg],
    }))

    // Stream the response
    await api.sendMessageStreamFetch(
      conversationId,
      message,
      {
        signal: abortController.signal,
        onStart: ({ message_id, title }) => {
          setStreamingMessageId(message_id)
          if (title && title !== conversationTitle) {
            setCurrentConversation((prev) => ({ ...prev, title }))
          }
        },
        onChunk: (text, fullContent) => {
          setStreamingContent(fullContent)
        },
        onThinking: (thinking) => {
          setStreamingThinking(thinking)
        },
        onDone: async ({ message_id, title, content, stopped }) => {
          streamAbortRef.current = null

          if (stopped) {
            // Keep the partial content - it's already saved in backend
            setIsGenerating(false)
          } else {
            // Clear streaming state and refresh conversation to get saved message
            setStreamingContent('')
            setStreamingThinking('')
            setStreamingMessageId(null)
            setIsGenerating(false)

            // Refresh conversation to get the complete saved message
            try {
              const updatedConv = await api.getConversation(conversationId)
              setCurrentConversation(updatedConv)
              await loadConversations()
            } catch (e) {
              console.error('Failed to refresh conversation:', e)
            }
          }
        },
        onError: (errMsg) => {
          streamAbortRef.current = null
          setError('Failed to send message: ' + errMsg)
          setStreamingContent('')
          setStreamingThinking('')
          setStreamingMessageId(null)
          setIsGenerating(false)
        },
      }
    )
  }

  const handleRegenerate = async (userMessageId) => {
    if (!currentConversation) return

    setIsGenerating(true)
    setError(null)

    try {
      const response = await api.regenerateResponse(currentConversation.id, userMessageId)

      // Update the message
      setCurrentConversation((prev) => {
        const msgIndex = prev.messages.findIndex((m) => m.id === userMessageId)
        if (msgIndex === -1) return prev

        const newMessages = [
          ...prev.messages.slice(0, msgIndex + 1),
          {
            id: response.message_id,
            role: 'assistant',
            content: response.content,
            thinking: response.thinking,
            type: response.type,
            created_at: new Date().toISOString(),
            complete: true,
          },
        ]

        return { ...prev, messages: newMessages }
      })

      await loadConversations()
    } catch (err) {
      setError('Failed to regenerate: ' + err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleStopGeneration = async () => {
    if (!currentConversation || !streamAbortRef.current) return

    try {
      await api.stopGeneration(currentConversation.id)
      // Don't abort the fetch here - let it finish naturally
      // The backend will save partial content and mark as complete
    } catch (err) {
      setError('Failed to stop generation: ' + err.message)
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversation?.id}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onAutoRenameConversation={handleAutoRenameConversation}
        renamingConversationId={renamingConversationId}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <h1 className="font-semibold text-gray-700">
            {currentConversation?.title || 'Select a conversation'}
          </h1>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-red-600 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              ×
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {currentConversation ? (
            currentConversation.messages.length > 0 || streamingMessageId ? (
              <>
                {currentConversation.messages
                  .filter((msg) => msg.id !== streamingMessageId)
                  .map((message) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      onRegenerate={
                        message.role === 'user'
                          ? () => handleRegenerate(message.id)
                          : null
                      }
                      isGenerating={false}
                    />
                  ))}

                {/* Streaming message (show if we have streaming state and it's not in saved messages) */}
                {streamingMessageId && (
                  <div className="flex gap-4 p-4 bg-gray-50">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-green-500">
                      <Bot size={16} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-700">Assistant</span>
                        <span className="text-xs text-gray-400 animate-pulse">Generating...</span>
                      </div>

                      {/* Thinking (streamed in quote format) */}
                      {streamingThinking && (
                        <div className="mb-3 p-3 bg-blue-50 border-l-4 border-blue-300 rounded-r-lg">
                          <div className="flex items-center gap-1 text-xs font-medium text-blue-600 mb-1">
                            <span>💭</span> Thinking
                          </div>
                          <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                            {streamingThinking}
                          </div>
                        </div>
                      )}

                      {/* Text content - streaming markdown */}
                      <div className="text-gray-800 break-words">
                        <ReactMarkdown
                          components={{
                            code({ node, inline, className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '')
                              const codeString = String(children).replace(/\n$/, '')

                              // Inline code
                              if (inline) {
                                return (
                                  <code className="bg-gray-200 text-pink-600 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                                    {children}
                                  </code>
                                )
                              }

                              // Code block with copy button
                              return <StreamingCodeBlock language={match ? match[1] : null} codeString={codeString} />
                            },
                            table({ children }) {
                              return <div className="overflow-x-auto my-3"><table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">{children}</table></div>
                            },
                            thead({ children }) {
                              return <thead className="bg-gray-50">{children}</thead>
                            },
                            tbody({ children }) {
                              return <tbody className="divide-y divide-gray-200">{children}</tbody>
                            },
                            tr({ children }) {
                              return <tr className="hover:bg-gray-50">{children}</tr>
                            },
                            th({ children }) {
                              return <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{children}</th>
                            },
                            td({ children }) {
                              return <td className="px-4 py-2 text-sm text-gray-700">{children}</td>
                            },
                            p({ children }) {
                              return <p className="mb-2 last:mb-0">{children}</p>
                            },
                            ul({ children }) {
                              const isTaskList = String(children).includes('type="checkbox"')
                              if (isTaskList) {
                                return <ul className="list-none mb-2 space-y-1">{children}</ul>
                              }
                              return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
                            },
                            ol({ children }) {
                              return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
                            },
                            li({ children }) {
                              return <li className="text-gray-700 flex items-start gap-2">{children}</li>
                            },
                            input({ type, checked, disabled, ...props }) {
                              if (type === 'checkbox') {
                                return (
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={disabled}
                                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-not-allowed flex-shrink-0"
                                    {...props}
                                  />
                                )
                              }
                              return <input type={type} checked={checked} disabled={disabled} {...props} />
                            },
                            blockquote({ children }) {
                              return <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600 my-2">{children}</blockquote>
                            },
                          }}
                        >
                          {streamingContent || ''}
                        </ReactMarkdown>
                        <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>Send a message to start the conversation</p>
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <p>Select a conversation or start a new one</p>
            </div>
          )}
        </div>

        {/* Input */}
        <MessageInput
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          isGenerating={isGenerating}
        />
      </div>
    </div>
  )
}
