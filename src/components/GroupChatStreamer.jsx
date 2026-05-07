import { Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

const AGENT_COLORS = {
  'Minimax': 'bg-purple-500',
  'GLM-5.1': 'bg-blue-500',
  'Kimi K2.6': 'bg-orange-500',
  'Gemma4-e4b': 'bg-emerald-500',
}

const AGENT_AVATAR_COLORS = {
  'Minimax': 'bg-purple-100 text-purple-700',
  'GLM-5.1': 'bg-blue-100 text-blue-700',
  'Kimi K2.6': 'bg-orange-100 text-orange-700',
  'Gemma4-e4b': 'bg-emerald-100 text-emerald-700',
}

function getAgentColor(agentName, type = 'bg') {
  if (type === 'avatar') return AGENT_AVATAR_COLORS[agentName] || 'bg-gray-100 text-gray-700'
  return AGENT_COLORS[agentName] || 'bg-gray-500'
}

export default function GroupChatStreamer({ state }) {
  const { phase, evaluations, speakingAgent, streamingContent, streamingThinking, agentDone } = state

  if (phase === 'evaluating') {
    return (
      <div className="p-4 bg-gray-50">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <span className="text-sm text-gray-500">Evaluating responses...</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {evaluations.map(ev => (
            <div
              key={ev.agent_id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${getAgentColor(ev.agent_name, 'avatar')}`}
            >
              <Bot size={12} />
              <span>{ev.agent_name}</span>
              {ev.should_respond ? (
                <span className="ml-1 text-amber-600">wants to speak</span>
              ) : (
                <span className="ml-1 text-gray-400">passing</span>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (phase === 'speaking' && speakingAgent) {
    return (
      <div className="flex gap-4 p-4 bg-gray-50">
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${getAgentColor(speakingAgent.agent_name)}`}>
          <Bot size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-700">{speakingAgent.agent_name}</span>
            <span className="text-xs text-gray-400 animate-pulse">Speaking...</span>
          </div>

          {streamingThinking && (
            <div className="mb-3 p-3 bg-blue-50 border-l-4 border-blue-300 rounded-r-lg">
              <div className="flex items-center gap-1 text-xs font-medium text-blue-600 mb-1">
                <span>Thinking</span>
              </div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                {streamingThinking}
              </div>
            </div>
          )}

          <div className="text-gray-800 break-words">
            <ReactMarkdown>{streamingContent || ''}</ReactMarkdown>
            {!agentDone && (
              <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1" />
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
