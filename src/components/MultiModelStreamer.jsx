import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { Bot, Check, Copy, AlertCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

const MODEL_LABELS = {
  minimax: 'Minimax',
  'glm5.1': 'GLM-5.1',
  'kimi-k2.6': 'Kimi K2.6',
}

const IsInPreContext = createContext(false)

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
    <div className="rounded overflow-hidden my-2 text-sm block">
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

const markdownComponents = {
  code({ node, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    const codeString = String(children).replace(/\n$/, '')
    const isInPre = useContext(IsInPreContext)
    if (!isInPre) {
      return (
        <code className="bg-gray-200 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      )
    }
    return <StreamingCodeBlock language={match ? match[1] : null} codeString={codeString} />
  },
  pre({ children }) {
    return <IsInPreContext.Provider value={true}>{children}</IsInPreContext.Provider>
  },
  table({ children }) {
    return <div className="overflow-x-auto my-3"><table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">{children}</table></div>
  },
  thead({ children }) { return <thead className="bg-gray-50">{children}</thead> },
  tbody({ children }) { return <tbody className="divide-y divide-gray-200">{children}</tbody> },
  tr({ children }) { return <tr className="hover:bg-gray-50">{children}</tr> },
  th({ children }) { return <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{children}</th> },
  td({ children }) { return <td className="px-4 py-2 text-sm text-gray-700">{children}</td> },
  p({ children }) { return <p className="mb-2 last:mb-0">{children}</p> },
  ul({ children }) { return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul> },
  ol({ children }) { return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol> },
  li({ children }) { return <li className="text-gray-700 flex items-start gap-2">{children}</li> },
  blockquote({ children }) { return <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600 my-2">{children}</blockquote> },
}

export default function MultiModelStreamer({ multiStreamingState, onTabChange }) {
  if (!multiStreamingState) return null

  const { models, activeTab, streams } = multiStreamingState
  const activeStream = streams[activeTab]

  return (
    <div className="flex gap-4 p-4 bg-gray-50">
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-green-500">
        <Bot size={16} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-semibold text-gray-700">Assistant</span>

          {/* Model tabs */}
          <div className="flex items-center gap-1 ml-2">
            {models.map(model => {
              const stream = streams[model]
              const isActive = model === activeTab
              let statusIcon = null
              if (stream?.error) {
                statusIcon = <AlertCircle size={10} className="text-red-500" />
              } else if (stream?.isDone) {
                statusIcon = <Check size={10} className="text-green-500" />
              } else {
                statusIcon = <span className="inline-block w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              }

              return (
                <button
                  key={model}
                  onClick={() => onTabChange(model)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {MODEL_LABELS[model] || model}
                  {statusIcon}
                </button>
              )
            })}
          </div>
        </div>

        {/* Active tab's thinking */}
        {activeStream?.thinking && (
          <div className="mb-3 p-3 bg-blue-50 border-l-4 border-blue-300 rounded-r-lg">
            <div className="flex items-center gap-1 text-xs font-medium text-blue-600 mb-1">
              <span>Thinking</span>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
              {activeStream.thinking}
            </div>
          </div>
        )}

        {/* Active tab's content */}
        <div className="text-gray-800 break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {activeStream?.content || ''}
          </ReactMarkdown>
          {activeStream && !activeStream.isDone && !activeStream.error && (
            <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1" />
          )}
        </div>

        {/* Error state for active tab */}
        {activeStream?.error && (
          <div className="mt-2 text-sm text-red-500">
            Error: {activeStream.error}
          </div>
        )}
      </div>
    </div>
  )
}
