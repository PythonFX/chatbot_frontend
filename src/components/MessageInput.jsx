import { Send, Square, Flame } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export default function MessageInput({ onSendMessage, onStopGeneration, isGenerating, deepQAMode, onToggleDeepQAMode }) {
  const [input, setInput] = useState('')
  const textareaRef = useRef(null)
  const isComposingRef = useRef(false)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px'
    }
  }, [input])

  const handleSubmit = (e) => {
    e.preventDefault()
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
    handleSubmit(e)
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
      <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2 shadow-sm">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onCompositionStart={() => { isComposingRef.current = true }}
          onCompositionEnd={() => { isComposingRef.current = false }}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          rows={1}
          className="flex-1 resize-none outline-none max-h-36 text-gray-800 placeholder-gray-400"
        />
        <div className="flex items-center gap-2">
          {/* Deep QA Mode Toggle */}
          <button
            type="button"
            onClick={onToggleDeepQAMode}
            className={`p-2 rounded-lg transition-colors ${
              deepQAMode
                ? 'text-orange-500 bg-orange-50 hover:bg-orange-100'
                : 'text-gray-400 hover:bg-gray-100'
            }`}
            title={deepQAMode ? 'Deep Q&A Mode (ON)' : 'Deep Q&A Mode (OFF)'}
          >
            <Flame size={18} />
          </button>
          {isGenerating && (
            <button
              type="button"
              onClick={onStopGeneration}
              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Stop generation"
            >
              <Square size={18} />
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() || isGenerating}
            className={`p-2 rounded-lg transition-colors ${
              input.trim() && !isGenerating
                ? 'text-blue-500 hover:bg-blue-50'
                : 'text-gray-300 cursor-not-allowed'
            }`}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </form>
  )
}
