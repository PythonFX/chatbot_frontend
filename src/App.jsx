import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
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
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
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
  const autoScrollRef = useRef(true) // Auto-scroll during streaming, disabled on user scroll
  const chunkTextLenRef = useRef(0) // Accumulated text length for scroll triggering
  const messageRefs = useRef([]) // Refs for each message element
  const [currentMessageIndex, setCurrentMessageIndex] = useState(-1) // Track current navigated message
  const [collapsedMessages, setCollapsedMessages] = useState(new Set()) // Set of collapsed message IDs
  const [contextMenu, setContextMenu] = useState(null) // { x, y } for context menu position

  // Load conversations on mount
  useEffect(() => {
    loadConversations()
  }, [])

  // Load conversation from URL when it changes
  // Extract conversationId directly from pathname to avoid useParams() timing issues
  useEffect(() => {
    const match = location.pathname.match(/^\/conversation\/([^/]+)$/)
    const urlConversationId = match ? match[1] : null

    if (urlConversationId) {
      api.getConversation(urlConversationId).then(conv => {
        setCurrentConversation(conv)
      }).catch(err => {
        setError('Failed to load conversation: ' + err.message)
        if (err.message.includes('404') || err.message.includes('not found')) {
          navigate('/', { replace: true })
        }
      })
    }
  }, [location.pathname, navigate])

  // Auto-select latest conversation only when on root path
  useEffect(() => {
    const isOnRoot = location.pathname === '/' || location.pathname === ''
    if (isOnRoot && conversations.length > 0 && !currentConversation) {
      const latestConv = conversations[0]
      navigate(`/conversation/${latestConv.id}`, { replace: true })
    }
  }, [conversations.length, currentConversation, location.pathname, navigate])

  // Check if current conversation has incomplete message and resume streaming
  useEffect(() => {
    if (currentConversation) {
      const incompleteMsg = currentConversation.messages.find(m => !m.complete && m.role === 'assistant')
      if (incompleteMsg) {
        setStreamingMessageId(incompleteMsg.id)
        setStreamingContent(incompleteMsg.content)
        setStreamingThinking(incompleteMsg.thinking || '')
        setIsGenerating(true)

        // Reset auto-scroll for resumed stream
        autoScrollRef.current = true
        chunkTextLenRef.current = incompleteMsg.content.length

        // Resume the stream subscription
        const abortController = new AbortController()
        streamAbortRef.current = abortController

        api.sendMessageStreamFetch(
          currentConversation.id,
          '',  // Empty message for resume
          {
            signal: abortController.signal,
            onStart: ({ message_id, title }) => {
              // Update title if changed
              if (title && title !== currentConversation.title) {
                setCurrentConversation((prev) => ({ ...prev, title }))
              }
              // Content will come as chunks (including accumulated content as first chunk)
            },
            onChunk: (text, fullContent) => {
              setStreamingContent(fullContent)
              // Throttled scroll: only scroll when we've accumulated ~100+ new chars
              const newLen = fullContent.length
              if (newLen - chunkTextLenRef.current >= 100) {
                scrollToBottom()
                chunkTextLenRef.current = newLen
              }
            },
            onThinking: (thinking) => {
              setStreamingThinking(thinking)
              scrollToBottom()
            },
            onDone: async ({ message_id, title, content, stopped }) => {
              streamAbortRef.current = null
              // Scroll to bottom after markdown rendering settles
              setTimeout(scrollToBottomForced, 50)
              setStreamingContent('')
              setStreamingThinking('')
              setStreamingMessageId(null)
              setIsGenerating(false)
              if (!stopped) {
                // Refresh conversation to get the complete saved message
                try {
                  const updatedConv = await api.getConversation(currentConversation.id)
                  setCurrentConversation(updatedConv)
                  await loadConversations()
                } catch (e) {
                  console.error('Failed to refresh conversation:', e)
                }
              }
            },
            onError: (errMsg) => {
              streamAbortRef.current = null
              console.error('Stream resume error:', errMsg)
              setIsGenerating(false)
            },
          },
          true  // resume = true
        )
      }
    }
  }, [currentConversation?.id])

  // Reset message refs and navigation index when conversation changes
  useEffect(() => {
    messageRefs.current = []
    setCurrentMessageIndex(-1)
    setCollapsedMessages(new Set())
    setContextMenu(null)
  }, [currentConversation?.id])

  const scrollToBottom = () => {
    if (!autoScrollRef.current || !messagesEndRef.current) return
    const container = messagesEndRef.current.parentElement
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    if (distanceFromBottom > 100) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    }
  }

  // Scroll to bottom unconditionally (used on stream end)
  const scrollToBottomForced = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.parentElement.scrollTo({ top: messagesEndRef.current.parentElement.scrollHeight, behavior: 'smooth' })
    }
  }

  // Scroll to a specific message by index
  const scrollToMessage = (index) => {
    const refs = messageRefs.current
    if (refs[index]) {
      refs[index].scrollIntoView({ behavior: 'smooth', block: 'start' })
      setCurrentMessageIndex(index)
    }
  }

  // Navigate to previous message (w key)
  const scrollToPreviousMessage = () => {
    if (!currentConversation?.messages.length) return
    const newIndex = currentMessageIndex <= 0 ? 0 : currentMessageIndex - 1
    scrollToMessage(newIndex)
  }

  // Navigate to next message (s key)
  const scrollToNextMessage = () => {
    if (!currentConversation?.messages.length) return
    const maxIndex = currentConversation.messages.length - 1
    const newIndex = currentMessageIndex >= maxIndex ? maxIndex : currentMessageIndex + 1
    scrollToMessage(newIndex)
  }

  // Keyboard navigation for messages
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return
      }

      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault()
        scrollToPreviousMessage()
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        scrollToNextMessage()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentConversation?.messages, currentMessageIndex])

  // Collapse all messages
  const collapseAll = () => {
    if (!currentConversation?.messages.length) return
    const allIds = new Set(currentConversation.messages.map(m => m.id))
    setCollapsedMessages(allIds)
    setContextMenu(null)
  }

  // Uncollapse all messages
  const uncollapseAll = () => {
    setCollapsedMessages(new Set())
    setContextMenu(null)
  }

  // Check if all messages are collapsed
  const allCollapsed = currentConversation?.messages.length > 0 &&
    currentConversation.messages.every(m => collapsedMessages.has(m.id))

  // Handler for user scroll - disables auto-scroll
  const handleUserScroll = () => {
    autoScrollRef.current = false
  }

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
      navigate(`/conversation/${newConv.id}`)
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

    // Update URL
    navigate(`/conversation/${id}`)

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
        // Navigate to root so it auto-selects the latest
        navigate('/', { replace: true })
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

    // Reset auto-scroll for new stream
    autoScrollRef.current = true
    chunkTextLenRef.current = 0

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

    // Scroll to user message immediately
    setTimeout(scrollToBottom, 0)

    // Optimistically add assistant message placeholder (avatar + name show immediately)
    const assistantMsgId = `optimistic-${Date.now()}`
    setCurrentConversation((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          thinking: null,
          created_at: new Date().toISOString(),
          complete: false,
          isGenerating: true,
        },
      ],
    }))

    // Stream the response
    await api.sendMessageStreamFetch(
      conversationId,
      message,
      {
        signal: abortController.signal,
        onStart: ({ message_id, title, tempAssistantMsgId }) => {
          // Update optimistic assistant message to use real ID, then stream takes over
          setCurrentConversation((prev) => ({
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === tempAssistantMsgId ? { ...m, id: message_id } : m
            ),
          }))
          setStreamingMessageId(message_id)
          if (title && title !== conversationTitle) {
            setCurrentConversation((prev) => ({ ...prev, title }))
          }
        },
        onChunk: (text, fullContent) => {
          setStreamingContent(fullContent)
          // Throttled scroll: only scroll when we've accumulated ~100+ new chars
          const newLen = fullContent.length
          if (newLen - chunkTextLenRef.current >= 100) {
            scrollToBottom()
            chunkTextLenRef.current = newLen
          }
        },
        onThinking: (thinking) => {
          setStreamingThinking(thinking)
          scrollToBottom()
        },
        onDone: async ({ message_id, title, content, stopped }) => {
          streamAbortRef.current = null
          // Scroll to bottom after markdown rendering settles
          setTimeout(scrollToBottomForced, 50)
          setStreamingContent('')
          setStreamingThinking('')
          setStreamingMessageId(null)
          setIsGenerating(false)

          if (!stopped) {
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
          // Remove optimistic assistant message on error
          setCurrentConversation((prev) => ({
            ...prev,
            messages: prev.messages.filter((m) => !m.id.startsWith('optimistic-')),
          }))
        },
      },
      false,
      assistantMsgId
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
        <div
          className="bg-white border-b border-gray-200 px-4 py-3 cursor-context-menu"
          onContextMenu={(e) => {
            e.preventDefault()
            setContextMenu({ x: e.clientX, y: e.clientY })
          }}
        >
          <h1 className="font-semibold text-gray-700">
            {currentConversation?.title || 'Select a conversation'}
          </h1>
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setContextMenu(null)}
            />
            <div
              className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                onClick={collapseAll}
                disabled={allCollapsed}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                折叠全部
              </button>
              <button
                onClick={uncollapseAll}
                disabled={collapsedMessages.size === 0}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                展开全部
              </button>
            </div>
          </>
        )}

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
        <div className="flex-1 overflow-y-auto pb-[60px] bg-gray-50" onWheel={handleUserScroll} onTouchMove={handleUserScroll}>
          {currentConversation ? (
            currentConversation.messages.length > 0 || streamingMessageId ? (
              <>
                {currentConversation.messages
                  .filter((msg) => msg.id !== streamingMessageId)
                  .map((message, index) => (
                    <div
                      key={message.id}
                      ref={(el) => (messageRefs.current[index] = el)}
                    >
                      <ChatMessage
                        message={message}
                        onRegenerate={
                          message.role === 'user'
                            ? () => handleRegenerate(message.id)
                            : null
                        }
                        isGenerating={false}
                        isCollapsed={collapsedMessages.has(message.id)}
                        onToggleCollapse={() => {
                          setCollapsedMessages(prev => {
                            const next = new Set(prev)
                            if (next.has(message.id)) {
                              next.delete(message.id)
                            } else {
                              next.add(message.id)
                            }
                            return next
                          })
                        }}
                      />
                    </div>
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
