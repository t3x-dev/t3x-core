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

// Chat message row component (divider-separated style)
function ChatMessageRow({
  message,
  onRate,
}: {
  message: ChatMessage
  onRate: (rating: number) => void
}) {
  const isUser = message.role === 'user'

  return (
    <div className={`chat-message-row ${isUser ? 'chat-message-row--user' : 'chat-message-row--assistant'}`}>
      <div className="chat-message-row__meta">
        <span className="chat-message-row__role">{isUser ? 'You' : 'Bot'}</span>
        <span className="chat-message-row__time">{message.timestamp}</span>
      </div>
      <div className="chat-message-row__content">
        <p>{message.content}</p>
      </div>
      {!isUser && (
        <div className="chat-message-row__rating">
          <span>Rate:</span>
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
    <div className="agent-chat-page">
      {/* Header Section */}
      <header className="agent-chat-page__header">
        <div className="agent-chat-page__header-left">
          <Bot size={20} />
          <h2>{agentName}</h2>
        </div>
        <span className="agent-chat-page__version">
          Deployed: v{deployedVersion} ({deployedCommitHash})
        </span>
        <button
          className="agent-chat-page__optimiser-btn"
          onClick={() => navigate('/agent-demo/optimiser')}
          type="button"
        >
          <Settings2 size={16} />
          Agent Optimiser
        </button>
      </header>

      {/* Messages Section */}
      <section className="agent-chat-page__messages">
        {messages.length === 0 ? (
          <div className="agent-chat-page__empty">
            <Bot size={40} />
            <h3>Start a conversation</h3>
            <p>Test the agent's responses. Your ratings help improve it.</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessageRow
                key={message.id}
                message={message}
                onRate={(rating) => rateMessage(message.id, rating)}
              />
            ))}
            {isTyping && (
              <div className="chat-message-row chat-message-row--assistant chat-message-row--typing">
                <div className="chat-message-row__meta">
                  <span className="chat-message-row__role">Bot</span>
                </div>
                <div className="chat-message-row__content">
                  <div className="typing-indicator">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </section>

      {/* Input Section */}
      <footer className="agent-chat-page__input">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          rows={2}
        />
        <button
          className="agent-chat-page__send-btn"
          onClick={handleSend}
          disabled={!inputValue.trim() || isTyping}
          type="button"
        >
          <Send size={18} />
          Send
        </button>
      </footer>
    </div>
  )
}
