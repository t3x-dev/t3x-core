import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Star, Send, Settings2 } from 'lucide-react'
import { useAgentDemoStore, type ChatMessage } from '../store/agentDemoStore'

// Star rating component
function StarRating({
  rating,
  onRate,
  disabled = false,
}: {
  rating?: number
  onRate: (rating: number) => void
  disabled?: boolean
}) {
  const [hoverRating, setHoverRating] = useState(0)

  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          className={`star-rating__star ${
            (hoverRating || rating || 0) >= star ? 'star-rating__star--filled' : ''
          }`}
          onClick={() => !disabled && onRate(star)}
          onMouseEnter={() => !disabled && setHoverRating(star)}
          onMouseLeave={() => setHoverRating(0)}
          disabled={disabled}
          type="button"
          aria-label={`Rate ${star} stars`}
        >
          <Star size={16} fill={(hoverRating || rating || 0) >= star ? 'currentColor' : 'none'} />
        </button>
      ))}
      {rating && <span className="star-rating__feedback">Feedback recorded</span>}
    </div>
  )
}

// Chat bubble component
function ChatBubble({
  message,
  onRate,
}: {
  message: ChatMessage
  onRate: (rating: number) => void
}) {
  const isUser = message.role === 'user'

  return (
    <div className={`agent-chat__bubble ${isUser ? 'agent-chat__bubble--user' : 'agent-chat__bubble--assistant'}`}>
      <div className="agent-chat__bubble-header">
        <span className="agent-chat__bubble-role">{isUser ? 'You' : 'Bot'}</span>
        <span className="agent-chat__bubble-time">{message.timestamp}</span>
      </div>
      <p className="agent-chat__bubble-content">{message.content}</p>
      {!isUser && (
        <div className="agent-chat__bubble-rating">
          <span>Rate this response:</span>
          <StarRating rating={message.rating} onRate={onRate} disabled={!!message.rating} />
        </div>
      )}
    </div>
  )
}

export default function AgentDemoChatPage() {
  const navigate = useNavigate()
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    agentName,
    deployedVersion,
    deployedCommitHash,
    messages,
    isTyping,
    sendMessage,
    rateMessage,
  } = useAgentDemoStore()

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSend = () => {
    if (inputValue.trim()) {
      sendMessage(inputValue.trim())
      setInputValue('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="agent-demo-chat-page">
      {/* Header */}
      <header className="agent-demo-chat-page__header">
        <div className="agent-demo-chat-page__agent-info">
          <Bot size={24} />
          <div>
            <h2>{agentName}</h2>
            <span className="agent-demo-chat-page__version">
              Deployed: v{deployedVersion} (commit {deployedCommitHash})
            </span>
          </div>
        </div>
        <button
          className="agent-demo-chat-page__optimiser-btn"
          onClick={() => navigate('/agent-demo/optimiser')}
          type="button"
        >
          <Settings2 size={16} />
          Open Agent Optimiser
        </button>
      </header>

      {/* Chat Area */}
      <div className="agent-demo-chat-page__chat">
        <div className="agent-demo-chat-page__messages">
          {messages.length === 0 && (
            <div className="agent-demo-chat-page__empty">
              <Bot size={48} />
              <h3>Welcome to {agentName}</h3>
              <p>Start a conversation to test the agent's responses.</p>
              <p className="agent-demo-chat-page__hint">
                Try asking about pricing, features, or report a technical issue.
                Your ratings help improve the agent!
              </p>
            </div>
          )}
          {messages.map((message) => (
            <ChatBubble
              key={message.id}
              message={message}
              onRate={(rating) => rateMessage(message.id, rating)}
            />
          ))}
          {isTyping && (
            <div className="agent-chat__bubble agent-chat__bubble--assistant agent-chat__bubble--typing">
              <div className="typing-indicator">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="agent-demo-chat-page__input">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            rows={2}
          />
          <button
            className="agent-demo-chat-page__send-btn"
            onClick={handleSend}
            disabled={!inputValue.trim() || isTyping}
            type="button"
          >
            <Send size={18} />
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
