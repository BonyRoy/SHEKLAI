/**
 * useAgentChat - WebSocket hook for real-time agent chat.
 *
 * Handles: connect/disconnect, send messages, receive streamed events,
 * auto-reconnect on drop, queue messages during reconnect.
 */

import { useCallback, useRef, useState, useEffect } from "react";
import { getAuthToken } from "./userContext";
import { WS_BASE_URL } from "./apiConfig";
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;

// --- Types ---

export type AgentMessageRole = "user" | "assistant" | "data_processor" | "system" | "thinking";

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  timestamp: Date;
  /** For status messages (tool calls, handoffs) */
  status?: string;
  /** If this message contains code output */
  isCodeOutput?: boolean;
  /** If this is a thinking/reasoning message (collapsible) */
  isThinking?: boolean;
  /** Whether thinking is still streaming */
  thinkingDone?: boolean;
  /** Python code that was executed (for CodeExecutor tool_start) */
  code?: string;
}

export type AgentStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "thinking"
  | "running_code"
  | "handing_off"
  | "error";

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  uncached_input_tokens?: number;
  session_prompt_tokens: number;
  session_completion_tokens: number;
  session_total_tokens: number;
  session_cache_creation_input_tokens?: number;
  session_cache_read_input_tokens?: number;
  model: string;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  default?: boolean;
}

interface UseAgentChatOptions {
  userId: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  /** If false, do not auto-reconnect when connection drops (e.g. when chat panel is closed). */
  shouldReconnect?: () => boolean;
}

interface UseAgentChatReturn {
  messages: AgentMessage[];
  status: AgentStatus;
  sendMessage: (content: string) => void;
  sendRenderError: (error: string) => void;
  cancelRun: () => void;
  connect: () => void;
  disconnect: () => void;
  clearMessages: () => void;
  isConnected: boolean;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  lastUsage: TokenUsage | null;
  sessionUsage: TokenUsage | null;
}

let messageCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++messageCounter}`;
}

// --- Persistence helpers ---
const MSG_STORAGE_KEY = "agentChatMessages";
const MSG_STORAGE_MAX = 200; // keep last N messages

function loadPersistedMessages(userId: string): AgentMessage[] {
  try {
    const raw = sessionStorage.getItem(`${MSG_STORAGE_KEY}_${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AgentMessage[];
    // Restore Date objects (serialized as strings)
    return parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function persistMessages(userId: string, msgs: AgentMessage[]) {
  try {
    // Only keep the most recent messages
    const toSave = msgs.slice(-MSG_STORAGE_MAX);
    sessionStorage.setItem(`${MSG_STORAGE_KEY}_${userId}`, JSON.stringify(toSave));
  } catch {
    // sessionStorage full or unavailable — ignore
  }
}

export function useAgentChat({
  userId,
  onConnect,
  onDisconnect,
  shouldReconnect = () => true,
}: UseAgentChatOptions): UseAgentChatReturn {
  const [messages, setMessages] = useState<AgentMessage[]>(() =>
    loadPersistedMessages(userId)
  );
  const [status, setStatus] = useState<AgentStatus>("disconnected");
  const [selectedModel, setSelectedModel] = useState<string>("claude-opus");
  const [lastUsage, setLastUsage] = useState<TokenUsage | null>(null);
  const [sessionUsage, setSessionUsage] = useState<TokenUsage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingQueue = useRef<string[]>([]);
  const selectedModelRef = useRef(selectedModel);
  selectedModelRef.current = selectedModel;
  // Track the streaming assistant message being built up
  const streamingMsgRef = useRef<{ id: string; content: string; source: string } | null>(null);
  // Track the streaming thinking message
  const thinkingMsgRef = useRef<{ id: string; content: string } | null>(null);

  // Persist messages to sessionStorage whenever they change
  useEffect(() => {
    persistMessages(userId, messages);
  }, [messages, userId]);

  const addMessage = useCallback(
    (role: AgentMessageRole, content: string, extra?: Partial<AgentMessage>) => {
      const msg: AgentMessage = {
        id: nextId(),
        role,
        content,
        timestamp: new Date(),
        ...extra,
      };
      setMessages((prev) => [...prev, msg]);
      return msg.id;
    },
    []
  );

  // Mark the thinking message as done (so UI can collapse it)
  const finalizeThinking = useCallback(() => {
    const t = thinkingMsgRef.current;
    if (t) {
      const tid = t.id;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tid ? { ...m, thinkingDone: true } : m
        )
      );
      thinkingMsgRef.current = null;
    }
  }, []);

  // Flush any accumulated streaming text into a final message
  const flushStreaming = useCallback(() => {
    finalizeThinking(); // also finalize thinking when stream completes
    const s = streamingMsgRef.current;
    if (s && s.content.trim()) {
      // Update the existing streaming message to its final form
      setMessages((prev) =>
        prev.map((m) =>
          m.id === s.id ? { ...m, content: s.content } : m
        )
      );
    }
    streamingMsgRef.current = null;
  }, [finalizeThinking]);

  const handleWsMessage = useCallback(
    (event: MessageEvent) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (data.type) {
        case "thinking_delta": {
          // Thinking/reasoning tokens — show in a collapsible "Thinking..." section
          setStatus("thinking");
          const thinkChunk = data.content || "";
          if (!thinkingMsgRef.current) {
            // Start a new thinking message
            const id = nextId();
            thinkingMsgRef.current = { id, content: thinkChunk };
            setMessages((prev) => [
              ...prev,
              {
                id,
                role: "thinking" as AgentMessageRole,
                content: thinkChunk,
                timestamp: new Date(),
                isThinking: true,
                thinkingDone: false,
              },
            ]);
          } else {
            // Append to existing thinking message
            thinkingMsgRef.current.content += thinkChunk;
            const updated = thinkingMsgRef.current.content;
            const tid = thinkingMsgRef.current.id;
            setMessages((prev) =>
              prev.map((m) => (m.id === tid ? { ...m, content: updated } : m))
            );
          }
          break;
        }

        case "text_delta": {
          // Streaming token — append to current streaming message
          // If we were in thinking phase, finalize it (thinking is before text)
          if (thinkingMsgRef.current) {
            finalizeThinking();
          }
          setStatus("thinking");
          const source = data.source || "assistant";
          if (
            !streamingMsgRef.current ||
            streamingMsgRef.current.source !== source
          ) {
            // Start a new streaming message
            flushStreaming();
            const id = nextId();
            const role: AgentMessageRole =
              source === "data_processor" ? "data_processor" : "assistant";
            streamingMsgRef.current = { id, content: data.content || "", source };
            setMessages((prev) => [
              ...prev,
              {
                id,
                role,
                content: data.content || "",
                timestamp: new Date(),
              },
            ]);
          } else {
            // Append to existing streaming message
            streamingMsgRef.current.content += data.content || "";
            const updated = streamingMsgRef.current.content;
            const sid = streamingMsgRef.current.id;
            setMessages((prev) =>
              prev.map((m) => (m.id === sid ? { ...m, content: updated } : m))
            );
          }
          break;
        }

        case "text": {
          // Complete text message from an agent (non-streaming fallback)
          flushStreaming();
          const role: AgentMessageRole =
            data.source === "data_processor" ? "data_processor" : "assistant";
          addMessage(role, data.content || "");
          break;
        }

        case "tool_start": {
          if (thinkingMsgRef.current) finalizeThinking();
          setStatus("running_code");
          if (data.tool !== "transfer_to_user") {
            addMessage("system", `Using tool: ${data.tool}`, {
              status: "tool_start",
              ...(data.code ? { code: data.code } : {}),
            });
          }
          break;
        }

        case "tool_result": {
          const output = data.output ?? "";
          // Don't show handoff-to-user confirmation (internal)
          const isHandoffToUser =
            typeof output === "string" &&
            (output.includes("Transferred to user") ||
              output.includes("adopting the role of user"));
          if (!isHandoffToUser) {
            addMessage("system", output || "(no output)", {
              status: "tool_result",
              isCodeOutput: true,
            });
          }
          setStatus("thinking");
          break;
        }

        case "cf_model_updated": {
          // Agent modified the cash flow model — notify any listening components
          window.dispatchEvent(new Event("cf_model_updated"));
          break;
        }

        case "cf_insight_published": {
          window.dispatchEvent(new Event("cf_insight_published"));
          break;
        }

        case "cf_forecast_algo_published": {
          window.dispatchEvent(new Event("cf_forecast_algo_published"));
          break;
        }

        case "handoff": {
          setStatus("handing_off");
          // Don't show "Handing off to user..." — that's just the assistant finishing
          if (data.to === "user") break;
          const label =
            data.to === "data_processor"
              ? "Handing off to Data Processor..."
              : data.to === "assistant"
              ? "Returning to Assistant..."
              : `Handing off to ${data.to}...`;
          addMessage("system", label, { status: "handoff" });
          break;
        }

        case "message_complete": {
          flushStreaming();
          if (data.usage && data.usage.total_tokens > 0) {
            const u: TokenUsage = data.usage;
            setLastUsage(u);
            setSessionUsage(u);
          }
          setStatus("connected");
          break;
        }

        case "cancelled": {
          flushStreaming();
          addMessage("system", "Cancelled", { status: "handoff" });
          setStatus("connected");
          break;
        }

        case "error": {
          flushStreaming();
          addMessage("system", `Error: ${data.message}`, { status: "error" });
          setStatus("connected");
          break;
        }

        case "status": {
          // Keepalive / progress update from backend (e.g. during 429 retries)
          setStatus("thinking");
          addMessage("system", data.message || "Working...", { status: "tool_result" });
          break;
        }

        default:
          break;
      }
    },
    [addMessage, flushStreaming]
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (!userId) return;

    setStatus("connecting");

    const wsBase = WS_BASE_URL || `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
    let wsUrl = `${wsBase}/ws/agent?user_id=${encodeURIComponent(userId)}`;
    const token = getAuthToken();
    if (token) wsUrl += `&token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setStatus("connected");
      reconnectAttempts.current = 0;
      wsRef.current = ws;

      // Start client-side heartbeat to keep WS alive during long agent runs
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25_000); // every 25s

      // Flush pending messages
      while (pendingQueue.current.length > 0) {
        const queued = pendingQueue.current.shift()!;
        ws.send(JSON.stringify({ type: "message", content: queued }));
      }

      onConnect?.();
    };

    ws.onmessage = handleWsMessage;

    ws.onclose = () => {
      wsRef.current = null;
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
      setStatus("disconnected");
      onDisconnect?.();

      // Auto-reconnect only when allowed (e.g. chat panel open) to avoid blocking UI
      if (
        shouldReconnect() &&
        reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS
      ) {
        reconnectAttempts.current += 1;
        const delay = RECONNECT_DELAY_MS * reconnectAttempts.current;
        reconnectTimer.current = setTimeout(() => {
          reconnectTimer.current = null;
          connect();
        }, delay);
      }
    };

    ws.onerror = () => {
      setStatus("error");
    };

    wsRef.current = ws;
  }, [userId, handleWsMessage, onConnect, onDisconnect, shouldReconnect]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
    reconnectAttempts.current = MAX_RECONNECT_ATTEMPTS; // prevent auto-reconnect
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;

      // Add user message immediately
      addMessage("user", content);

      // Include UI theme so the agent can generate theme-appropriate HTML
      const uiTheme = localStorage.getItem("theme") || "light";

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "message",
          content,
          theme: uiTheme,
          model: selectedModelRef.current,
        }));
        setStatus("thinking");
      } else {
        // Queue for when reconnected
        pendingQueue.current.push(content);
        connect();
      }
    },
    [addMessage, connect]
  );

  const sendRenderError = useCallback((error: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "client_error", error }));
    }
  }, []);

  const cancelRun = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cancel" }));
      addMessage("system", "Cancelling...", { status: "handoff" });
    }
  }, [addMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    streamingMsgRef.current = null;
    try { sessionStorage.removeItem(`${MSG_STORAGE_KEY}_${userId}`); } catch {}
  }, [userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
      }
      // Don't auto-disconnect on unmount — context persists
    };
  }, []);

  return {
    messages,
    status,
    sendMessage,
    sendRenderError,
    cancelRun,
    connect,
    disconnect,
    clearMessages,
    isConnected: status !== "disconnected" && status !== "error",
    selectedModel,
    setSelectedModel,
    lastUsage,
    sessionUsage,
  };
}
