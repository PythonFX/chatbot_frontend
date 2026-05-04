import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Bot, Copy, Check, Upload, X, FileText, MessageSquare, RefreshCw, Layers } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import Sidebar from './components/Sidebar'
import ChatMessage from './components/ChatMessage'
import MessageInput from './components/MessageInput'
import MultiModelStreamer from './components/MultiModelStreamer'
import SearchPopup from './components/SearchPopup'
import FilesList from './components/FilesList'
import NovelBookPicker from './components/NovelBookPicker'
import { api } from './api'

// Model switcher dropdown
function ModelSwitcher({ currentModel, availableModels, onSwitch, onClose }) {
  const MODEL_LABELS = {
    'minimax': 'Minimax',
    'glm5.1': 'GLM-5.1',
    'kimi-k2.6': 'Kimi K2.6',
  }

  const models = (availableModels || []).map(id => ({
    id,
    label: MODEL_LABELS[id] || id,
  }))

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 top-14 right-4 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
        {models.map(m => (
          <button
            key={m.id}
            onClick={() => { onSwitch(m.id); onClose() }}
            className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between ${
              m.id === currentModel ? 'text-blue-600 font-medium' : 'text-gray-700'
            }`}
          >
            {m.label}
            {m.id === currentModel && <span className="text-blue-500 text-xs">active</span>}
          </button>
        ))}
      </div>
    </>
  )
}

// Animated "Analyzing contexts..." component with cycling dots
function DeepQAThinking() {
  const [dotCount, setDotCount] = useState(1)

  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount(prev => prev >= 3 ? 1 : prev + 1)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <span className="text-xs text-orange-500 animate-pulse">
      Analyzing contexts{'.'.repeat(dotCount)}
    </span>
  )
}

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
  const [deepQAStatus, setDeepQAStatus] = useState(null) // 'processing' | 'done' | 'error' | null
  const messagesEndRef = useRef(null)
  const [renamingConversationId, setRenamingConversationId] = useState(null)
  const streamAbortRef = useRef(null) // Track ongoing stream request
  const autoScrollRef = useRef(true) // Auto-scroll during streaming, disabled on user scroll
  const chunkTextLenRef = useRef(0) // Accumulated text length for scroll triggering
  const messageRefs = useRef([]) // Refs for each message element
  const [currentMessageIndex, setCurrentMessageIndex] = useState(-1) // Track current navigated message
  const scrollSyncBlockedRef = useRef(false) // Block scrollSync briefly after keyboard navigation
  const [navHint, setNavHint] = useState(null) // { type: 'top'|'bottom', timer: id }
  const [collapsedMessages, setCollapsedMessages] = useState(new Set()) // Set of collapsed message IDs
  const [contextMenu, setContextMenu] = useState(null) // { x, y } for context menu position
  const [deepQAMode, setDeepQAMode] = useState(false) // Deep Q&A mode toggle
  const [novelAgentMode, setNovelAgentMode] = useState(false) // Novel agent mode
  const [pendingNovelBooks, setPendingNovelBooks] = useState(null) // Book list waiting for selection
  const [searchPopupOpen, setSearchPopupOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploadingFile, setUploadingFile] = useState(null) // { name, progress } during upload
  const [selectedFileIds, setSelectedFileIds] = useState([]) // Multi-select for RAG chat
  const [currentModel, setCurrentModel] = useState('minimax')
  const [availableModels, setAvailableModels] = useState(['minimax', 'glm5.1', 'kimi-k2.6'])
  const [modelSwitcherOpen, setModelSwitcherOpen] = useState(false)
  const [multiModelMode, setMultiModelMode] = useState(false)
  const [multiStreamingState, setMultiStreamingState] = useState(null)
  const [loadingFiles, setLoadingFiles] = useState(false) // Loading files from backend
  const [messageVersions, setMessageVersions] = useState({}) // { [messageId]: { selectedIndex: number|null, versions: array } }
  const [generatingVersionMessageId, setGeneratingVersionMessageId] = useState(null) // Message ID currently generating a new version

  // Persist messageVersions to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem('messageVersions', JSON.stringify(messageVersions))
    } catch (e) {
      console.error('Failed to save message versions to localStorage', e)
    }
  }, [messageVersions])

  // Derive isFilesView from URL
  const isFilesView = location.pathname === '/files'

  // Load files when on files view, and poll while files are processing
  useEffect(() => {
    if (!isFilesView) return

    let timeoutId = null

    const poll = () => {
      api.getFiles().then(files => {
        setUploadedFiles(files)
        setSelectedFileIds([])
        if (files.some(f => f.status === 'processing')) {
          timeoutId = setTimeout(poll, 1000)
        }
      }).catch(err => {
        setError('Failed to load files: ' + err.message)
      })
    }

    poll()
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [isFilesView])

  const loadFiles = async () => {
    setLoadingFiles(true)
    setSelectedFileIds([])
    try {
      const files = await api.getFiles()
      setUploadedFiles(files)
    } catch (err) {
      setError('Failed to load files: ' + err.message)
    } finally {
      setLoadingFiles(false)
    }
  }

  // Load conversations on mount
  useEffect(() => {
    loadConversations()
    // Fetch available models from backend
    api.getModels().then(data => {
      if (data.current) setCurrentModel(data.current)
      if (data.available) setAvailableModels(data.available)
    }).catch(() => {})
    try {
      const saved = localStorage.getItem('messageVersions')
      if (saved) setMessageVersions(JSON.parse(saved))
    } catch (e) {
      console.error('Failed to load message versions from localStorage', e)
    }
  }, [])

  // Load conversation from URL when it changes
  // Extract conversationId directly from pathname to avoid useParams() timing issues
  useEffect(() => {
    const match = location.pathname.match(/^\/conversation\/([^/]+)$/)
    const urlConversationId = match ? match[1] : null

    if (urlConversationId) {
      api.getConversation(urlConversationId).then(conv => {
        setCurrentConversation(conv)
        setNovelAgentMode(conv.is_novel_agent)
      }).catch(err => {
        setError('Failed to load conversation: ' + err.message)
        if (err.message.includes('404') || err.message.includes('not found')) {
          navigate('/', { replace: true })
        }
      })
    }
  }, [location.pathname, navigate])

  // When currentConversation changes with file_ids, load those embeddings
  useEffect(() => {
    if (currentConversation?.file_ids && currentConversation.file_ids.length > 0) {
      // Load embeddings for all linked files
      currentConversation.file_ids.forEach(fileId => {
        api.loadFile(fileId).catch(err => {
          console.error('Failed to load file embedding:', fileId, err)
        })
      })
    }
  }, [currentConversation?.id, currentConversation?.file_ids])

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
              setTimeout(scrollToBottomForced, 200)
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
      messagesEndRef.current.parentElement.scrollTo({ top: messagesEndRef.current.parentElement.scrollHeight, behavior: 'instant' })
    }
  }

  // Scroll to a specific message by index
  // Sync currentMessageIndex with actual scroll position via scroll position tracking
  useEffect(() => {
    const container = messagesEndRef.current?.parentElement
    if (!container) return

    const updateIndexFromScroll = () => {
      const containerRect = container.getBoundingClientRect()
      // Find the first message whose bottom edge is below the viewport center
      const viewportCenter = containerRect.top + containerRect.height / 2 + container.scrollTop

      let foundIdx = -1
      for (let i = 0; i < messageRefs.current.length; i++) {
        const el = messageRefs.current[i]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        const elTop = rect.top - containerRect.top + container.scrollTop
        const elBottom = elTop + rect.height
        if (elBottom > viewportCenter) {
          foundIdx = i
          break
        }
      }

      // If all messages fit above the center, use the last one
      if (foundIdx === -1 && messageRefs.current.length > 0) {
        foundIdx = messageRefs.current.length - 1
      }

      if (foundIdx !== -1 && foundIdx !== currentMessageIndex && !scrollSyncBlockedRef.current) {
        setCurrentMessageIndex(foundIdx)
      }
    }

    // Initial update
    updateIndexFromScroll()

    // Update on scroll
    container.addEventListener('scroll', updateIndexFromScroll, { passive: true })
    return () => container.removeEventListener('scroll', updateIndexFromScroll)
  }, [currentConversation?.messages])

  // Keyboard navigation for messages (w/s and arrow keys)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return
      }

      const messages = currentConversation?.messages
      if (!messages?.length) return

      const refs = messageRefs.current
      const maxIndex = refs.length - 1

      const isPrev = e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp'
      const isNext = e.key === 's' || e.key === 'S' || e.key === 'ArrowDown'

      if (isPrev) {
        e.preventDefault()
        const newIndex = currentMessageIndex <= 0 ? 0 : currentMessageIndex - 1
        if (refs[newIndex]) {
          refs[newIndex].scrollIntoView({ behavior: 'instant', block: 'start' })
          setCurrentMessageIndex(newIndex)
          scrollSyncBlockedRef.current = true
          setTimeout(() => { scrollSyncBlockedRef.current = false }, 400)
        }
        if (currentMessageIndex <= 0) {
          clearTimeout(navHint?.timer)
          const timer = setTimeout(() => setNavHint(null), 1500)
          setNavHint({ type: 'top', timer })
        }
      } else if (isNext) {
        e.preventDefault()
        const newIndex = Math.min(currentMessageIndex + 1, maxIndex)
        if (refs[newIndex]) {
          refs[newIndex].scrollIntoView({ behavior: 'instant', block: 'start' })
          setCurrentMessageIndex(newIndex)
          scrollSyncBlockedRef.current = true
          setTimeout(() => { scrollSyncBlockedRef.current = false }, 400)
        }
        if (currentMessageIndex >= maxIndex) {
          clearTimeout(navHint?.timer)
          const timer = setTimeout(() => setNavHint(null), 1500)
          setNavHint({ type: 'bottom', timer })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentConversation?.messages, currentMessageIndex, streamingMessageId])

  // Global keyboard shortcut for search popup (Cmd+P / Ctrl+P)
  useEffect(() => {
    const handleSearchShortcut = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault()
        setSearchPopupOpen(true)
      }
    }

    window.addEventListener('keydown', handleSearchShortcut)
    return () => window.removeEventListener('keydown', handleSearchShortcut)
  }, [])

  // Escape key closes mobile sidebar
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [sidebarOpen])

  // Handler for when a search result is selected
  const handleSearchSelect = useCallback((result) => {
    setSearchPopupOpen(false)
    // Navigate to the conversation containing this message
    handleSelectConversation(result.conversation_id)
  }, [])

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
      setNovelAgentMode(conv.is_novel_agent)
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
    setDeepQAStatus(null)
    setMultiStreamingState(null)

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
        onDeepQAStatus: ({ status, message }) => {
          setDeepQAStatus(status)
          // When DeepQA processing is done, clear it after a short delay
          if (status === 'done') {
            setTimeout(() => setDeepQAStatus(null), 1000)
          } else if (status === 'error') {
            setTimeout(() => setDeepQAStatus(null), 3000)
          }
        },
        onNovelBooks: (books) => {
          setPendingNovelBooks(books)
        },
        onNovelSelected: (book) => {
          setPendingNovelBooks(null)
          setNovelAgentMode(true)
        },
        onMultiStart: ({ message_id, models, version_map }) => {
          const streams = {}
          models.forEach(m => { streams[m] = { content: '', thinking: '', isDone: false, error: null } })
          setMultiStreamingState({ models, activeTab: models[0], versionMap: version_map, streams })
        },
        onMultiChunk: (model, text) => {
          setMultiStreamingState(prev => {
            if (!prev) return prev
            const stream = prev.streams[model]
            if (!stream) return prev
            return {
              ...prev,
              streams: { ...prev.streams, [model]: { ...stream, content: stream.content + text } },
            }
          })
        },
        onMultiThinking: (model, thinking) => {
          setMultiStreamingState(prev => {
            if (!prev) return prev
            const stream = prev.streams[model]
            if (!stream) return prev
            return {
              ...prev,
              streams: { ...prev.streams, [model]: { ...stream, thinking: stream.thinking + thinking } },
            }
          })
        },
        onModelDone: (model, version_index) => {
          setMultiStreamingState(prev => {
            if (!prev) return prev
            const stream = prev.streams[model]
            if (!stream) return prev
            return {
              ...prev,
              streams: { ...prev.streams, [model]: { ...stream, isDone: true } },
            }
          })
        },
        onModelError: (model, error) => {
          setMultiStreamingState(prev => {
            if (!prev) return prev
            const stream = prev.streams[model]
            if (!stream) return prev
            return {
              ...prev,
              streams: { ...prev.streams, [model]: { ...stream, isDone: true, error } },
            }
          })
        },
        onDone: async ({ message_id, title, content, stopped }) => {
          streamAbortRef.current = null
          // Scroll to bottom after markdown rendering settles
          setTimeout(scrollToBottomForced, 200)
          setStreamingContent('')
          setStreamingThinking('')
          setStreamingMessageId(null)
          setDeepQAStatus(null)
          setMultiStreamingState(null)
          setIsGenerating(false)

          if (!stopped) {
            // Refresh conversation to get the complete saved message
            try {
              const updatedConv = await api.getConversation(conversationId)
              setCurrentConversation(updatedConv)
              setNovelAgentMode(updatedConv.is_novel_agent)
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
      assistantMsgId,
      deepQAMode,
      multiModelMode
    )
  }

  const handleRegenerate = async (userMessageId) => {
    if (!currentConversation) return
    setIsGenerating(true)
    setError(null)
    try {
      await api.regenerateResponse(currentConversation.id, userMessageId)
      const updatedConv = await api.getConversation(currentConversation.id)
      setCurrentConversation(updatedConv)
      await loadConversations()
    } catch (err) {
      setError('Failed to regenerate: ' + err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSelectVersion = async (messageId, versionIndex) => {
    if (!currentConversation) return
    try {
      const result = await api.selectMessageVersion(messageId, currentConversation.id, versionIndex)
      // Update local state
      setMessageVersions(prev => ({
        ...prev,
        [messageId]: {
          ...prev[messageId],
          selectedIndex: versionIndex,
          versions: currentConversation.messages.find(m => m.id === messageId)?.versions ?? [],
        }
      }))
      // Update the message content in currentConversation
      setCurrentConversation(prev => ({
        ...prev,
        messages: prev.messages.map(m =>
          m.id === messageId
            ? { ...m, content: result.content, thinking: result.thinking, selected_version_index: result.selected_version_index }
            : m
        )
      }))
    } catch (err) {
      setError('Failed to select version: ' + err.message)
    }
  }

  const handleGenerateVersion = async (messageId) => {
    if (!currentConversation) return
    if (generatingVersionMessageId) return // Prevent concurrent

    setGeneratingVersionMessageId(messageId)
    setError(null)

    const abortController = new AbortController()
    let timeoutId = null
    let versionIndex = null

    // 3-minute timeout guard
    timeoutId = setTimeout(() => {
      abortController.abort()
      setGeneratingVersionMessageId(null)
      setError('Version generation timed out')
    }, 180000)

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      setGeneratingVersionMessageId(null)
    }

    api.generateVersionStream(messageId, currentConversation.id, {
      signal: abortController.signal,
      onStart: ({ version_index }) => {
        versionIndex = version_index
        // Add placeholder version and switch UI to it
        setCurrentConversation(prev => {
          if (!prev) return prev
          return {
            ...prev,
            messages: prev.messages.map(m => {
              if (m.id !== messageId) return m
              const versions = m.versions ? [...m.versions] : []
              // Ensure the array is long enough (backend may have added versions we don't know about)
              while (versions.length <= version_index) {
                versions.push({ content: '', thinking: null, status: 'generating' })
              }
              return { ...m, selected_version_index: version_index, versions }
            }),
          }
        })
      },
      onChunk: (text) => {
        if (versionIndex === null) return
        setCurrentConversation(prev => {
          if (!prev) return prev
          return {
            ...prev,
            messages: prev.messages.map(m => {
              if (m.id !== messageId || !m.versions || !m.versions[versionIndex]) return m
              const updatedVersions = [...m.versions]
              updatedVersions[versionIndex] = {
                ...updatedVersions[versionIndex],
                content: (updatedVersions[versionIndex].content || '') + text,
              }
              return { ...m, versions: updatedVersions }
            }),
          }
        })
      },
      onThinking: (thinking) => {
        if (versionIndex === null) return
        setCurrentConversation(prev => {
          if (!prev) return prev
          return {
            ...prev,
            messages: prev.messages.map(m => {
              if (m.id !== messageId || !m.versions || !m.versions[versionIndex]) return m
              const updatedVersions = [...m.versions]
              updatedVersions[versionIndex] = {
                ...updatedVersions[versionIndex],
                thinking: (updatedVersions[versionIndex].thinking || '') + thinking,
              }
              return { ...m, versions: updatedVersions }
            }),
          }
        })
      },
      onDone: async () => {
        cleanup()
        // Refresh conversation from backend to get clean persisted state
        try {
          const updatedConv = await api.getConversation(currentConversation.id)
          setCurrentConversation(updatedConv)
        } catch (e) {
          console.error('Failed to refresh conversation after version generation:', e)
        }
      },
      onError: (errMsg) => {
        cleanup()
        setError('Failed to generate version: ' + errMsg)
      },
    })
  }

  const handleRegenerateModel = async (messageId, model) => {
    if (!currentConversation) return
    setIsGenerating(true)
    setError(null)
    try {
      await api.regenerateModel(currentConversation.id, messageId, model)
      // Refresh conversation to get the updated version
      const updatedConv = await api.getConversation(currentConversation.id)
      setCurrentConversation(updatedConv)
    } catch (err) {
      setError('Failed to regenerate model: ' + err.message)
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

  const handleBrowseFiles = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.doc,.docx,.txt,.json'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return

      // Start upload progress simulation
      setUploadingFile({ name: file.name, progress: 0 })

      // Simulate progress (backend processes async, so we simulate)
      const progressInterval = setInterval(() => {
        setUploadingFile(prev => {
          if (!prev) return null
          const newProgress = Math.min(prev.progress + Math.random() * 15, 90)
          return { ...prev, progress: newProgress }
        })
      }, 200)

      try {
        const result = await api.uploadFile(file)
        clearInterval(progressInterval)
        setUploadingFile({ name: file.name, progress: 100 })

        setTimeout(async () => {
          // Refresh files list from backend
          const files = await api.getFiles()
          setUploadedFiles(files)
          setUploadingFile(null)
        }, 500)
      } catch (err) {
        clearInterval(progressInterval)
        setError('Failed to upload file: ' + err.message)
        setUploadingFile(null)
      }
    }
    input.click()
  }

  const handleDeleteFile = async (fileId) => {
    // Remove from selected if selected
    setSelectedFileIds(prev => prev.filter(id => id !== fileId))

    try {
      await api.deleteFile(fileId)
      setUploadedFiles(prev => prev.filter(f => f.id !== fileId))
    } catch (err) {
      setError('Failed to delete file: ' + err.message)
    }
  }

  const handleShowFiles = async () => {
    navigate('/files')
  }

  const handleCreateChatWithFiles = async () => {
    if (selectedFileIds.length === 0) return

    try {
      // Wait for all selected files to be ready (not processing)
      const MAX_WAIT_TIME = 60000 // 60 seconds max
      const POLL_INTERVAL = 1000 // 1 second

      for (const fileId of selectedFileIds) {
        const startTime = Date.now()
        while (Date.now() - startTime < MAX_WAIT_TIME) {
          const file = await api.getFile(fileId)
          if (file.status === 'ready') {
            break
          } else if (file.status === 'error') {
            throw new Error(`File "${file.name}" processing failed: ${file.error}`)
          }
          // Wait before polling again
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
        }

        // Check if still processing after max wait
        const file = await api.getFile(fileId)
        if (file.status !== 'ready') {
          throw new Error(`File "${file.name}" is still processing. Please wait and try again.`)
        }
      }

      // Now load selected files' embeddings into memory
      for (const fileId of selectedFileIds) {
        await api.loadFile(fileId)
      }

      // Create new conversation
      const newConv = await api.createConversation()

      // Update conversation with linked file IDs
      await api.updateConversationFiles(newConv.id, selectedFileIds)

      // Clear selection and switch to chat view
      setSelectedFileIds([])
      setCurrentConversation({ ...newConv, messages: [], file_ids: selectedFileIds })
      navigate(`/conversation/${newConv.id}`)
    } catch (err) {
      setError('Failed to start chat with files: ' + err.message)
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Desktop sidebar - always shown on md+ */}
      <div className="hidden md:block">
        <Sidebar
          conversations={conversations}
          currentConversationId={currentConversation?.id}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          onAutoRenameConversation={handleAutoRenameConversation}
          renamingConversationId={renamingConversationId}
          onShowFiles={handleShowFiles}
          isFilesView={isFilesView}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed left-0 top-0 h-full z-50 md:hidden">
            <div className="text-sm">
              <Sidebar
              conversations={conversations}
              currentConversationId={currentConversation?.id}
              onSelectConversation={(id) => {
                handleSelectConversation(id)
                setSidebarOpen(false)
              }}
              onNewConversation={() => {
                handleNewConversation()
                setSidebarOpen(false)
              }}
              onDeleteConversation={handleDeleteConversation}
              onRenameConversation={handleRenameConversation}
              onAutoRenameConversation={handleAutoRenameConversation}
              renamingConversationId={renamingConversationId}
              onShowFiles={() => {
                handleShowFiles()
                setSidebarOpen(false)
              }}
              isFilesView={isFilesView}
              onClose={() => setSidebarOpen(false)}
              />
            </div>
          </div>
        </>
      )}

      {/* Floating toggle button - mobile/tablet only */}
      <button
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center z-30 md:hidden transition-colors"
        onClick={() => setSidebarOpen(true)}
        title="Open chat list"
      >
        <MessageSquare size={24} />
      </button>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col md:text-base text-sm">
        {/* Header */}
        <div
          className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {isFilesView ? (
              <h1 className="font-semibold text-gray-700">Uploaded Files</h1>
            ) : (
              <h1
                className="font-semibold text-gray-700 truncate cursor-pointer"
                onClick={(e) => setContextMenu({ x: e.clientX, y: e.clientY })}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY })
                }}
              >
                {currentConversation?.title || 'Select a conversation'}
              </h1>
            )}

            {/* Upload progress area */}
            {uploadingFile && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 min-w-0">
                <FileText size={14} className="text-blue-500 flex-shrink-0" />
                <span className="text-sm text-blue-700 truncate max-w-32">{uploadingFile.name}</span>
                <div className="w-20 h-2 bg-blue-200 rounded-full overflow-hidden flex-shrink-0">
                  <div
                    className="h-full bg-blue-500 transition-all duration-200 rounded-full"
                    style={{ width: `${uploadingFile.progress}%` }}
                  />
                </div>
                <span className="text-xs text-blue-500">{Math.round(uploadingFile.progress)}%</span>
                <button
                  onClick={() => setUploadingFile(null)}
                  className="p-0.5 hover:bg-blue-100 rounded"
                >
                  <X size={12} className="text-blue-400" />
                </button>
              </div>
            )}
          </div>

          {/* Model switcher + multi-model toggle - shown when not on /files */}
          {!isFilesView && (
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              {!multiModelMode && (
                <div className="relative">
                  <button
                    onClick={() => setModelSwitcherOpen(prev => !prev)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm text-gray-700"
                    title="Switch model"
                  >
                    <Bot size={14} />
                    <span>{({ minimax: 'Minimax', 'glm5.1': 'GLM-5.1', 'kimi-k2.6': 'Kimi K2.6' })[currentModel] || currentModel}</span>
                    <span className="text-xs text-gray-400">▾</span>
                  </button>
                  {modelSwitcherOpen && (
                    <ModelSwitcher
                      currentModel={currentModel}
                      availableModels={availableModels}
                      onSwitch={async (model) => {
                        setCurrentModel(model)
                        try {
                          await api.switchModel(model)
                        } catch (err) {
                          setError('Failed to switch model: ' + err.message)
                        }
                      }}
                      onClose={() => setModelSwitcherOpen(false)}
                    />
                  )}
                </div>
              )}
              <button
                onClick={() => setMultiModelMode(prev => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-sm ${
                  multiModelMode
                    ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
                title={multiModelMode ? 'Multi-model mode: all models respond simultaneously' : 'Switch to multi-model mode'}
              >
                <Layers size={14} />
                <span>{multiModelMode ? 'Multi' : 'Single'}</span>
              </button>
            </div>
          )}

          {/* Files view buttons - only show when on /files */}
          {isFilesView && (
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              <button
                onClick={loadFiles}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm text-gray-700"
                title="Refresh file status"
              >
                <RefreshCw size={14} className={loadingFiles ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={handleBrowseFiles}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm text-gray-700"
              >
                <Upload size={14} />
                <span>Browse Files</span>
              </button>
            </div>
          )}
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setContextMenu(null)}
            />
            <div
              className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 flex flex-col"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                onClick={allCollapsed ? uncollapseAll : collapseAll}
                className="px-4 py-2 text-left text-sm hover:bg-gray-100"
              >
                {allCollapsed ? 'Expand All' : 'Collapse All'}
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
          {isFilesView ? (
            loadingFiles ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
                  <p>Loading files...</p>
                </div>
              </div>
            ) : (
              <FilesList
                files={uploadedFiles}
                selectedIds={selectedFileIds}
                onSelectionChange={setSelectedFileIds}
                onDeleteFile={handleDeleteFile}
              />
            )
          ) : currentConversation ? (
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
                        onSelectVersion={message.role === 'assistant' ? handleSelectVersion : null}
                        onGenerateVersion={message.role === 'assistant' ? handleGenerateVersion : null}
                        onRegenerateModel={message.role === 'assistant' ? handleRegenerateModel : null}
                        isGenerating={isGenerating}
                        generatingVersionMessageId={generatingVersionMessageId}
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
                        isNovelAgentMode={novelAgentMode}
                      />
                    </div>
                  ))}

                {/* Streaming message */}
                {multiStreamingState && streamingMessageId ? (
                  <MultiModelStreamer
                    multiStreamingState={multiStreamingState}
                    onTabChange={(tab) => setMultiStreamingState(prev => prev ? { ...prev, activeTab: tab } : prev)}
                  />
                ) : streamingMessageId && (
                  <div className="flex gap-4 p-4 bg-gray-50">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-green-500">
                      <Bot size={16} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-700">Assistant</span>
                        {deepQAMode && deepQAStatus === 'processing' ? (
                          <DeepQAThinking />
                        ) : (
                          <span className="text-xs text-gray-400 animate-pulse">Generating...</span>
                        )}
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

                {/* Navigation hint tooltip */}
                {navHint && (
                  <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-gray-800 text-gray-200 text-sm rounded-lg shadow-lg z-50 pointer-events-none">
                    {navHint.type === 'top' ? '已到达第一条消息' : '已到达最后一条消息'}
                  </div>
                )}
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

        {/* Input - hidden when in files view */}
        {!isFilesView && (
          <MessageInput
            onSendMessage={handleSendMessage}
            onStopGeneration={handleStopGeneration}
            isGenerating={isGenerating}
            deepQAMode={deepQAMode}
            onToggleDeepQAMode={() => setDeepQAMode(prev => !prev)}
          />
        )}

        {/* Create Chat with Files button - bottom right overlay */}
        {isFilesView && selectedFileIds.length > 0 && (
          <div className="fixed bottom-6 right-6 z-10">
            <button
              onClick={handleCreateChatWithFiles}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow-lg transition-colors"
            >
              <MessageSquare size={18} />
              <span>Create Chat with {selectedFileIds.length} File{selectedFileIds.length > 1 ? 's' : ''}</span>
            </button>
          </div>
        )}
      </div>

      {/* Search Popup */}
      {searchPopupOpen && (
        <SearchPopup
          onClose={() => setSearchPopupOpen(false)}
          onSelectResult={handleSearchSelect}
        />
      )}

      {/* Novel Book Picker */}
      {pendingNovelBooks !== null && (
        <NovelBookPicker
          books={pendingNovelBooks}
          onSelect={(number) => {
            if (number === null) {
              setPendingNovelBooks(null)
            } else {
              handleSendMessage(number)
            }
          }}
        />
      )}
    </div>
  )
}
