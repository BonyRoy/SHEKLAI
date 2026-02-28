/**
 * AgentChat - Floating chat panel (bottom-right).
 *
 * Features:
 * - Message list with markdown rendering
 * - Code block syntax highlighting
 * - Real-time status indicators
 * - Auto-scroll to bottom
 * - Text input with Enter to send
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, Component } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useAgentChatContext } from "../contexts/AgentChatContext";
import ChatHtmlFrame from "./ChatHtmlFrame";
import type { AgentMessage, AgentStatus } from "../services/useAgentChat";
import "./AgentChat.css";

// --- React Error Boundary for chat message rendering ---
interface MessageErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: string) => void;
}
interface MessageErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
}

class MessageErrorBoundary extends Component<MessageErrorBoundaryProps, MessageErrorBoundaryState> {
  state: MessageErrorBoundaryState = { hasError: false, errorMsg: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error.message || String(error) };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error.message || String(error));
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="agent-msg system">
          <div className="agent-msg-bubble" style={{ color: "var(--error, #ef4444)", fontStyle: "italic" }}>
            Failed to render message: {this.state.errorMsg}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Status label mapping ---
function statusLabel(status: AgentStatus): string {
  switch (status) {
    case "connected":
      return "Online";
    case "connecting":
      return "Connecting...";
    case "thinking":
      return "Thinking...";
    case "running_code":
      return "Running code...";
    case "handing_off":
      return "Delegating...";
    case "error":
      return "Error";
    case "disconnected":
    default:
      return "Offline";
  }
}

const isActiveStatus = (s: AgentStatus) =>
  s === "thinking" || s === "running_code" || s === "handing_off";

// --- Thinking bubble (collapsible) ---
function ThinkingBubble({ msg }: { msg: AgentMessage }) {
  const [expanded, setExpanded] = useState(!msg.thinkingDone);

  // Auto-collapse when thinking finishes
  useEffect(() => {
    if (msg.thinkingDone) {
      const timer = setTimeout(() => setExpanded(false), 600);
      return () => clearTimeout(timer);
    }
  }, [msg.thinkingDone]);

  const charCount = msg.content.length;
  const preview = msg.content.slice(0, 80).replace(/\n/g, " ");

  return (
    <div className="agent-msg thinking">
      <div
        className={`thinking-bubble${expanded ? " expanded" : " collapsed"}`}
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="thinking-header">
          <span className="thinking-icon">{msg.thinkingDone ? "💭" : "⏳"}</span>
          <span className="thinking-label">
            {msg.thinkingDone ? "Thought" : "Thinking..."}
          </span>
          <span className="thinking-chars">{charCount > 100 ? `${Math.round(charCount / 100) / 10}k chars` : `${charCount} chars`}</span>
          <span className="thinking-toggle">{expanded ? "▾" : "▸"}</span>
        </div>
        {expanded && (
          <div className="thinking-content">
            {msg.content}
          </div>
        )}
        {!expanded && msg.thinkingDone && (
          <div className="thinking-preview">{preview}...</div>
        )}
      </div>
    </div>
  );
}

// --- System message content (with optional collapsible code) ---
function SystemContent({ msg }: { msg: AgentMessage }) {
  const [showCode, setShowCode] = useState(false);
  if (!msg.code) return <>{msg.content}</>;
  return (
    <>
      <span>{msg.content}</span>
      <button
        className="code-toggle-btn"
        onClick={() => setShowCode((v) => !v)}
        aria-expanded={showCode}
      >
        {showCode ? "▾ Hide code" : "▸ Show code"}
      </button>
      {showCode && (
        <SyntaxHighlighter
          style={oneDark}
          language="python"
          PreTag="div"
          customStyle={{
            margin: "4px 0 0",
            borderRadius: "6px",
            fontSize: "0.75em",
            maxHeight: "200px",
            overflow: "auto",
          }}
        >
          {msg.code}
        </SyntaxHighlighter>
      )}
    </>
  );
}

// --- Message component ---
function ChatMessageBubble({
  msg,
  onRenderError,
}: {
  msg: AgentMessage;
  onRenderError?: (error: string) => void;
}) {
  const htmlBlockCounter = useRef(0);

  if (msg.isThinking) {
    return <ThinkingBubble msg={msg} />;
  }

  const roleClass = msg.role;
  const bubbleLabel =
    msg.role === "user"
      ? "You"
      : msg.role === "assistant"
      ? "Assistant"
      : msg.role === "data_processor"
      ? "Data Processor"
      : "";

  const isToolResult = msg.status === "tool_result";
  htmlBlockCounter.current = 0;

  return (
    <div className={`agent-msg ${roleClass}`}>
      {bubbleLabel && <span className="agent-msg-label">{bubbleLabel}</span>}
      <div
        className={`agent-msg-bubble${isToolResult ? " tool-result" : ""}`}
      >
        {msg.role === "user" ? (
          msg.content
        ) : msg.role === "system" ? (
          <SystemContent msg={msg} />
        ) : (
          <ReactMarkdown
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const codeStr = String(children).replace(/\n$/, "");

                if (match) {
                  const lang = match[1].toLowerCase();
                  if (lang === "html") {
                    if (!codeStr.trim()) return null;
                    const blockIdx = ++htmlBlockCounter.current;
                    return (
                      <ChatHtmlFrame
                        html={codeStr}
                        label={`block-${blockIdx}`}
                        onRenderError={onRenderError}
                      />
                    );
                  }
                  return (
                    <SyntaxHighlighter
                      style={oneDark}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{
                        margin: "8px 0",
                        borderRadius: "8px",
                        fontSize: "0.78em",
                      }}
                    >
                      {codeStr}
                    </SyntaxHighlighter>
                  );
                }

                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {msg.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

// --- Typing indicator ---
function TypingIndicator({ status }: { status: AgentStatus }) {
  if (!isActiveStatus(status)) return null;

  return (
    <div className="agent-status-indicator">
      <div className="dot-pulse">
        <span />
        <span />
        <span />
      </div>
      <span>{statusLabel(status)}</span>
    </div>
  );
}

// --- Main component ---
const MODEL_OPTIONS: { id: string; label: string; provider: string }[] = [
  { id: "claude-opus", label: "Claude Opus 4.5", provider: "Anthropic" },
  { id: "claude-sonnet", label: "Claude Sonnet 4.5", provider: "Anthropic" },
  { id: "gpt-5.2", label: "GPT 5.2", provider: "Azure OpenAI" },
];

const COST_PER_MTOK: Record<
  string,
  {
    input: number;
    cachedInput: number;
    cacheWrite5m?: number;
    cacheWrite1h?: number;
    output: number;
  }
> = {
  "claude-opus": {
    input: 5.0,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10.0,
    cachedInput: 0.5,
    output: 25.0,
  },
  "claude-sonnet": {
    input: 3.0,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6.0,
    cachedInput: 0.3,
    output: 15.0,
  },
  "gpt-5.2": {
    input: 1.75,
    cachedInput: 0.175,
    output: 14.0,
  },
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface CostBreakdown {
  label: string;
  tooltip: string;
  savings: number;
}

function estimateCostDetailed(
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
  model: string
): CostBreakdown {
  const rates = COST_PER_MTOK[model] || COST_PER_MTOK["claude-opus"];
  const cacheWriteTokens = usage.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;
  const baseInputTokens = Math.max(0, usage.prompt_tokens - cacheWriteTokens - cacheReadTokens);
  const cacheWriteRate = rates.cacheWrite5m ?? rates.input;

  const baseCost = (baseInputTokens / 1_000_000) * rates.input;
  const writeCost = (cacheWriteTokens / 1_000_000) * cacheWriteRate;
  const readCost = (cacheReadTokens / 1_000_000) * rates.cachedInput;
  const outputCost = (usage.completion_tokens / 1_000_000) * rates.output;
  const totalCost = baseCost + writeCost + readCost + outputCost;

  const noCacheCost =
    (usage.prompt_tokens / 1_000_000) * rates.input +
    (usage.completion_tokens / 1_000_000) * rates.output;
  const savings = noCacheCost - totalCost;

  const parts: string[] = [];
  if (baseInputTokens > 0) parts.push(`Input: ${formatTokens(baseInputTokens)} × $${rates.input}/MTok = $${baseCost.toFixed(3)}`);
  if (cacheWriteTokens > 0) parts.push(`Cache write: ${formatTokens(cacheWriteTokens)} × $${cacheWriteRate}/MTok = $${writeCost.toFixed(3)}`);
  if (cacheReadTokens > 0) parts.push(`Cache read: ${formatTokens(cacheReadTokens)} × $${rates.cachedInput}/MTok = $${readCost.toFixed(3)}`);
  parts.push(`Output: ${formatTokens(usage.completion_tokens)} × $${rates.output}/MTok = $${outputCost.toFixed(3)}`);
  if (savings > 0.001) parts.push(`Cache saved: $${savings.toFixed(2)}`);

  const label = totalCost < 0.01 ? "< $0.01" : `$${totalCost.toFixed(2)}`;
  return { label, tooltip: parts.join("\n"), savings };
}

function estimateCost(
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
  model: string
): string {
  return estimateCostDetailed(usage, model).label;
}

export default function AgentChat() {
  const {
    messages,
    status,
    sendMessage,
    sendRenderError,
    cancelRun,
    clearMessages,
    isConnected,
    isChatOpen,
    toggleChat,
    closeChat,
    selectedModel,
    setSelectedModel,
    lastUsage,
    sessionUsage,
  } = useAgentChatContext();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isChatOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isChatOpen]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setInput("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Auto-resize textarea
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      const ta = e.target;
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    },
    []
  );

  return (
    <>
      {/* Floating Action Button */}
      <button
        className={`agent-chat-fab${isChatOpen ? " open" : ""}`}
        onClick={toggleChat}
        title={isChatOpen ? "Close chat" : "Open AI Assistant"}
      >
        <span className="fab-icon">{isChatOpen ? "✕" : "💬"}</span>
        <span
          className={`connection-dot${isConnected ? " connected" : ""}`}
        />
      </button>

      {/* Chat Panel */}
      {isChatOpen && (
        <div className="agent-chat-panel">
          {/* Header */}
          <div className="agent-chat-header">
            <div className="agent-chat-header-left">
              <div className="agent-chat-header-icon">🤖</div>
              <div className="agent-chat-header-info">
                <h3>Shekl.AI Assistant</h3>
                <span className="status-text">{statusLabel(status)}</span>
              </div>
            </div>
            <div className="agent-chat-header-actions">
              <button onClick={clearMessages} title="Clear chat">
                🗑
              </button>
              <button onClick={closeChat} title="Close">
                ✕
              </button>
            </div>
          </div>

          {/* Model Selector */}
          <div className="agent-model-selector">
            <label>Model:</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isActiveStatus(status)}
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Messages */}
          <div className="agent-chat-messages">
            {messages.length === 0 ? (
              <div className="agent-chat-empty">
                <div className="empty-icon">💡</div>
                <h4>How can I help?</h4>
                <p>
                  Ask me about your cash flow data, transactions, or
                  forecasting. I can analyze your uploaded files and run
                  Python code for data processing.
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <MessageErrorBoundary key={msg.id} onError={sendRenderError}>
                  <ChatMessageBubble msg={msg} onRenderError={sendRenderError} />
                </MessageErrorBoundary>
              ))
            )}
            <TypingIndicator status={status} />
            <div ref={messagesEndRef} />
          </div>

          {/* Token Usage */}
          {lastUsage && lastUsage.total_tokens > 0 && (() => {
            const lastModel = lastUsage.model || selectedModel;
            const lastCost = estimateCostDetailed(lastUsage, lastModel);
            const sessionCost = sessionUsage && sessionUsage.session_total_tokens > 0
              ? estimateCostDetailed(
                  {
                    prompt_tokens: sessionUsage.session_prompt_tokens,
                    completion_tokens: sessionUsage.session_completion_tokens,
                    cache_creation_input_tokens: sessionUsage.session_cache_creation_input_tokens,
                    cache_read_input_tokens: sessionUsage.session_cache_read_input_tokens,
                  },
                  sessionUsage.model || selectedModel
                )
              : null;

            return (
              <div className="agent-usage-bar">
                <div className="agent-usage-row">
                  <span className="agent-usage-label">Last call</span>
                  <span className="agent-usage-tokens">
                    {formatTokens(lastUsage.prompt_tokens)} in / {formatTokens(lastUsage.completion_tokens)} out
                    {(lastUsage.cache_read_input_tokens ?? 0) > 0 && (
                      <span
                        className="agent-cache-badge"
                        title={`Cached: ${formatTokens(lastUsage.cache_read_input_tokens!)} read, ${formatTokens(lastUsage.cache_creation_input_tokens || 0)} written`}
                      >
                        {Math.round(100 * lastUsage.cache_read_input_tokens! / Math.max(lastUsage.prompt_tokens, 1))}% cached
                      </span>
                    )}
                  </span>
                  <span className="agent-usage-cost" title={lastCost.tooltip}>
                    {lastCost.label}
                    {lastCost.savings > 0.005 && (
                      <span className="agent-savings-badge">-${lastCost.savings.toFixed(2)}</span>
                    )}
                  </span>
                </div>
                {sessionCost && sessionUsage && (
                  <div className="agent-usage-row session">
                    <span className="agent-usage-label">Session</span>
                    <span className="agent-usage-tokens">
                      {formatTokens(sessionUsage.session_total_tokens)} tokens
                    </span>
                    <span className="agent-usage-cost" title={sessionCost.tooltip}>
                      {sessionCost.label}
                      {sessionCost.savings > 0.01 && (
                        <span className="agent-savings-badge">saved ${sessionCost.savings.toFixed(2)}</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Input */}
          <div className="agent-chat-input">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                status === "connecting"
                  ? "Connecting..."
                  : isConnected
                  ? "Ask about your data..."
                  : "Offline — type and send when back online"
              }
              rows={1}
              disabled={status === "connecting"}
            />
            {isActiveStatus(status) ? (
              <button
                className="send-btn"
                onClick={cancelRun}
                title="Cancel"
                style={{ background: "#ef4444" }}
              >
                ■
              </button>
            ) : (
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={!input.trim() || status === "connecting"}
                title="Send message"
              >
                ➤
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
