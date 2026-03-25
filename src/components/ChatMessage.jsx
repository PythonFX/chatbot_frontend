import { useState, useMemo, useEffect, Component } from 'react'
import { User, Bot, RotateCcw, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

// Error boundary for markdown parsing
class MarkdownErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.error('Markdown error:', error)
  }

  render() {
    if (this.state.hasError) {
      return <pre className="whitespace-pre-wrap text-sm">{this.props.content}</pre>
    }
    return this.props.children
  }
}

function CodeBlock({ language, codeString }) {
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
          {copied ? (
            <>
              <Check size={12} />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
        }}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  )
}

export default function ChatMessage({ message, onRegenerate, isGenerating }) {
  const isUser = message.role === 'user'
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isThinkingCollapsed, setIsThinkingCollapsed] = useState(false)

  // Pre-parse checkbox positions from content for stable indexing
  const checkboxPositions = useMemo(() => {
    const positions = []
    const regex = /\[([ xX])\]/g
    let match
    while ((match = regex.exec(message.content)) !== null) {
      positions.push({
        checked: match[1].toLowerCase() === 'x',
        index: positions.length
      })
    }
    return positions
  }, [message.content])

  // Track which checkboxes are user-toggled
  const [toggledIndices, setToggledIndices] = useState(new Set())

  // Reset toggled state when message content changes
  useEffect(() => {
    setToggledIndices(new Set())
  }, [message.id])

  const handleToggle = (index) => {
    setToggledIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  // Counter for assigning indices during render (resets each render)
  let checkboxRenderIndex = 0

  return (
    <div className={`flex gap-4 p-4 ${isUser ? 'bg-white' : 'bg-gray-50'}`}>
      {/* Avatar - double click to collapse */}
      <div
        onDoubleClick={() => setIsCollapsed(c => !c)}
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${
          isUser ? 'bg-blue-500' : 'bg-green-500'
        }`}
      >
        {isUser ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-gray-700">{isUser ? 'You' : 'Assistant'}</span>
          {!isUser && onRegenerate && (
            <button
              onClick={() => onRegenerate(message.id)}
              disabled={isGenerating}
              className="p-1 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
              title="Regenerate response"
            >
              <RotateCcw size={14} />
            </button>
          )}
          {isCollapsed && (
            <span className="text-xs text-gray-400">(collapsed)</span>
          )}
        </div>

        {/* Collapsible area - double click to collapse */}
        <div onDoubleClick={() => setIsCollapsed(c => !c)} className="cursor-pointer">
          {/* Thinking (if present) */}
          {message.thinking && !isCollapsed && (
            <div className="mb-3 p-3 bg-blue-50 border-l-4 border-blue-300 rounded-r-lg">
              <div
                onClick={() => setIsThinkingCollapsed(c => !c)}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 mb-1 cursor-pointer hover:bg-blue-100 hover:px-1 hover:rounded transition-colors"
              >
                <span>💭</span> Thinking
                <span className={`ml-auto transition-transform ${isThinkingCollapsed ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </div>
              {!isThinkingCollapsed && (
                <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                  {message.thinking}
                </div>
              )}
            </div>
          )}

          {/* Main content - rendered as markdown */}
          <div className="text-gray-800 break-words">
            {isCollapsed ? (
              <CollapsedContent content={message.content} />
            ) : (
              <MarkdownErrorBoundary content={message.content}>
                <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '')
                const codeString = String(children).replace(/\n$/, '')

                // Inline code - short snippets within text
                if (inline) {
                  return (
                    <code className="bg-gray-200 text-pink-600 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                      {children}
                    </code>
                  )
                }

                // Code block with syntax highlighting and copy button
                return <CodeBlock language={match ? match[1] : null} codeString={codeString} />
              },
              p({ children }) {
                return <p className="mb-2 last:mb-0">{children}</p>
              },
              ul({ children, ...props }) {
                // Check if this is a task list (contains checkbox inputs)
                const childrenStr = String(children || '')
                const isTaskList = childrenStr.includes('type="checkbox"')
                if (isTaskList) {
                  return <ul className="list-none mb-2 space-y-1">{children}</ul>
                }
                return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
              },
              ol({ children }) {
                return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
              },
              li({ children, ...props }) {
                return (
                  <li className="text-gray-700 flex items-start gap-2">
                    {children}
                  </li>
                )
              },
              input({ type, checked, disabled, ...props }) {
                if (type === 'checkbox') {
                  const currentIndex = checkboxRenderIndex++
                  const info = checkboxPositions[currentIndex]
                  const isOriginallyChecked = info?.checked ?? false
                  const isToggled = toggledIndices.has(currentIndex)
                  // XOR: if toggled, flip the original state
                  const effectiveChecked = isToggled ? !isOriginallyChecked : isOriginallyChecked
                  const isInteractive = !isUser

                  return (
                    <input
                      type="checkbox"
                      checked={effectiveChecked}
                      disabled={false}
                      onChange={() => isInteractive && handleToggle(currentIndex)}
                      className={`mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 flex-shrink-0 ${isInteractive ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    />
                  )
                }
                return <input type={type} checked={checked} disabled={disabled} {...props} />
              },
              h1({ children }) {
                return <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0">{children}</h1>
              },
              h2({ children }) {
                return <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h2>
              },
              h3({ children }) {
                return <h3 className="text-base font-semibold mb-1 mt-2 first:mt-0">{children}</h3>
              },
              blockquote({ children }) {
                return <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600 my-2">{children}</blockquote>
              },
              a({ href, children }) {
                return <a href={href} className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>
              },
              hr() {
                return <hr className="my-4 border-gray-200" />
              },
              table({ children }) {
                return <div className="overflow-x-auto my-3 inline-block border border-gray-200 rounded-lg">{children}</div>
              },
              thead({ children }) {
                return <thead className="bg-gray-100">{children}</thead>
              },
              tbody({ children }) {
                return <tbody>{children}</tbody>
              },
              tr({ children }) {
                return <tr className="hover:bg-gray-50">{children}</tr>
              },
              th({ children }) {
                return <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700 bg-gray-100 border-b border-r border-gray-200 last:border-r-0">{children}</th>
              },
              td({ children }) {
                return <td className="px-4 py-2 text-sm text-gray-600 border-b border-r border-gray-200 last:border-r-0">{children}</td>
              },
            }}
          >
            {message.content || ''}
          </ReactMarkdown>
              </MarkdownErrorBoundary>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper to show collapsed content preview
function CollapsedContent({ content }) {
  // Split into lines and limit to ~5 lines max, or half if fewer
  const lines = content.split('\n')
  const maxLines = 5
  const showLines = lines.length <= maxLines ? Math.ceil(lines.length / 2) : maxLines
  const preview = lines.slice(0, showLines).join('\n')

  return (
    <div className="relative">
      <pre className="whitespace-pre-wrap text-sm text-gray-500 break-words">{preview}{lines.length > showLines ? '\n...' : ''}</pre>
    </div>
  )
}
