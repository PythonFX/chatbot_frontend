import { Square, Flame, ArrowUp, Users, Lock, MessageCircle } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'

export default function MessageInput({ onSendMessage, onStopGeneration, isGenerating, deepQAMode, onToggleDeepQAMode, hasFiles, multiModelMode, onToggleMultiModelMode, groupChatMode, onToggleGroupChatMode, isGroupChat }) {
  const [input, setInput] = useState('')
  const [locked, setLocked] = useState(false)
  const [shaking, setShaking] = useState(false)
  const textareaRef = useRef(null)
  const isComposingRef = useRef(false)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200)
      textareaRef.current.style.height = newHeight + 'px'
    }
  }, [input])

  const triggerShake = useCallback(() => {
    setShaking(true)
    setTimeout(() => setShaking(false), 500)
  }, [])

  const handleSubmit = () => {
    if (locked) {
      triggerShake()
      return
    }
    if (input.trim() && !isGenerating) {
      onSendMessage(input.trim())
      setInput('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return
    if (e.shiftKey) return

    const nativeEvent = e.nativeEvent
    if (isComposingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229) {
      return
    }

    e.preventDefault()
    if (locked) {
      triggerShake()
      return
    }
    handleSubmit()
  }

  const handleSendContextMenu = (e) => {
    e.preventDefault()
    setLocked(prev => !prev)
  }

  return (
    <div className="relative z-10 -mt-10 px-4 pb-4 pt-10">
      <div className="message-input-shell bg-white rounded-[28px]">
        <div className="overflow-hidden rounded-[28px]">
        {/* Textarea area */}
        <div className="px-5 pt-3 pb-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={() => { isComposingRef.current = false }}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            rows={1}
            className="w-full resize-none outline-none max-h-[200px] text-gray-800 placeholder-gray-400 text-[15px] leading-6"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 mx-4" />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 py-2">
          {/* Left side: mode toggles */}
          <div className="flex items-center gap-1">
            {hasFiles ? (
              <button
                type="button"
                onClick={onToggleDeepQAMode}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  deepQAMode
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
                title={deepQAMode ? 'Deep Q&A Mode (ON)' : 'Deep Q&A Mode (OFF)'}
              >
                <Flame size={16} />
                <span>Deep Think</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onToggleMultiModelMode}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    multiModelMode
                      ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                  title={multiModelMode ? 'Multi-model mode (ON)' : 'Multi-model mode (OFF)'}
                >
                  <Users size={16} />
                  <span>Multi</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleGroupChatMode}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    groupChatMode || isGroupChat
                      ? 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                  title={groupChatMode || isGroupChat ? 'Group chat mode (ON)' : 'Group chat mode: AI agents discuss together'}
                >
                  <MessageCircle size={16} />
                  <span>Group</span>
                </button>
              </>
            )}
          </div>

          {/* Right side: Stop + Send */}
          <div className="flex items-center gap-1">
            {isGenerating && (
              <button
                type="button"
                onClick={onStopGeneration}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                title="Stop generation"
              >
                <Square size={18} fill="currentColor" />
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              onContextMenu={handleSendContextMenu}
              disabled={!input.trim() || isGenerating}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
                locked
                  ? input.trim() && !isGenerating
                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
                    : 'bg-amber-200 text-amber-400 cursor-not-allowed'
                  : input.trim() && !isGenerating
                    ? 'bg-gray-800 hover:bg-gray-900 text-white shadow-sm'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              } ${shaking ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
              title={locked ? 'Send locked - right-click to unlock' : 'Send message (right-click to lock)'}
            >
              {locked ? <Lock size={16} /> : <ArrowUp size={18} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
