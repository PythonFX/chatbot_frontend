import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Search } from 'lucide-react'
import { api } from '../api'

export default function SearchPopup({ onClose, onSelectResult }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [popupHeight, setPopupHeight] = useState(0)
  const inputRef = useRef(null)
  const resultsRef = useRef(null)
  const debounceRef = useRef(null)
  const popupRef = useRef(null)

  // Track popup height to determine position
  useEffect(() => {
    if (!popupRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPopupHeight(entry.contentRect.height)
      }
    })
    observer.observe(popupRef.current)
    return () => observer.disconnect()
  }, [])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Memoized callback for search results
  const handleSearchResults = useCallback((data) => {
    setResults(data.results || [])
    setSelectedIndex(0)
  }, [])

  // Debounced search
  useSearch(query, setIsLoading, handleSearchResults, debounceRef)

  // Keyboard navigation in results
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      const selected = results[selectedIndex]
      if (selected) {
        onSelectResult(selected)
      }
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const selectedEl = resultsRef.current.children[selectedIndex]
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex, results])

  const handleResultClick = (result) => {
    onSelectResult(result)
  }

  // Determine top position based on popup height
  // If popup height > 60vh, use 12vh; otherwise use 20vh
  const topPercent = popupHeight > window.innerHeight * 0.6 ? '12vh' : '20vh'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center" style={{ paddingTop: topPercent }}>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />

      {/* Popup */}
      <div
        ref={popupRef}
        className="relative bg-white rounded-xl shadow-2xl w-[50vw] max-w-3xl overflow-hidden z-10 max-lg:w-[75vw] max-lg:max-w-none max-sm:w-[90vw] max-h-[75vh] flex flex-col"
      >
        {/* Search input row */}
        <div className="flex items-center px-4 py-3 border-b border-gray-200">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search all messages..."
            className="flex-1 mx-3 text-gray-800 placeholder-gray-400 outline-none text-base"
          />
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin flex-shrink-0" />
          ) : (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            >
              <X size={18} className="text-gray-400" />
            </button>
          )}
        </div>

        {/* Results */}
        <div
          ref={resultsRef}
          className="flex-1 overflow-y-auto bg-gray-50 min-h-0"
        >
          {results.length > 0 ? (
            results.map((result, index) => (
              <div
                key={`${result.conversation_id}-${result.message_id}-${index}`}
                onClick={() => handleResultClick(result)}
                className={`px-4 py-2 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 ${
                  index === selectedIndex
                    ? 'bg-blue-50 border-blue-200'
                    : 'hover:bg-gray-100 border-transparent'
                }`}
                style={{
                  borderLeftWidth: '1px',
                  borderRightWidth: '1px',
                  borderRadius: index === selectedIndex ? '6px' : '0',
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                    {result.role}
                  </span>
                  <span className="text-xs text-gray-400 truncate max-w-[200px]">
                    {result.conversation_title}
                  </span>
                </div>
                {/* 3-line display */}
                <div className="text-xs text-gray-700 leading-relaxed">
                  {/* Line 1: context before */}
                  <div className="truncate whitespace-nowrap">
                    {result.context_before.length > 50 ? '...' : ''}{result.context_before.slice(-50)}
                  </div>
                  {/* Line 2: context before end + keyword (highlighted) + context after start */}
                  <div className="truncate whitespace-nowrap font-medium">
                    {result.context_before.slice(-30)}
                    <span className="bg-yellow-200 font-bold">{result.matched_text}</span>
                    {result.context_after.slice(0, 30)}
                  </div>
                  {/* Line 3: context after */}
                  <div className="truncate whitespace-nowrap">
                    {result.context_after.slice(30)}
                    {result.context_after.length > 50 ? '...' : ''}
                  </div>
                </div>
              </div>
            ))
          ) : query.length > 0 && !isLoading ? (
            <div className="px-4 py-8 text-center text-gray-400">
              No results found
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function useSearch(query, setIsLoading, onResults, debounceRef) {
  useEffect(() => {
    if (!query || query.trim().length === 0) {
      onResults({ results: [] })
      return
    }

    setIsLoading(true)

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Debounce search by 200ms
    const timeoutId = setTimeout(async () => {
      try {
        const data = await api.searchConversations(query)
        onResults(data)
      } catch (err) {
        console.error('Search failed:', err)
        onResults({ results: [] })
      } finally {
        setIsLoading(false)
      }
    }, 200)

    debounceRef.current = timeoutId

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [query])
}
