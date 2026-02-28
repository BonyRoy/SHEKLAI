/**
 * AgentChatContext - Global chat state that persists across page navigation.
 *
 * Wraps useAgentChat and provides it to the entire app.
 * Also manages the chat panel open/closed state.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { useAgentChat } from "../services/useAgentChat";
import { getUserId } from "../services/userContext";
import type { AgentMessage, AgentStatus, TokenUsage } from "../services/useAgentChat";

interface AgentChatContextValue {
  /** Chat messages */
  messages: AgentMessage[];
  /** Current agent status */
  status: AgentStatus;
  /** Send a message to the agent */
  sendMessage: (content: string) => void;
  /** Cancel the current agent run */
  cancelRun: () => void;
  /** Connect to the agent WebSocket */
  connect: () => void;
  /** Disconnect from the agent WebSocket */
  disconnect: () => void;
  /** Clear all messages */
  clearMessages: () => void;
  /** Whether the WebSocket is connected */
  isConnected: boolean;
  /** Whether the chat panel is open */
  isChatOpen: boolean;
  /** Toggle the chat panel */
  toggleChat: () => void;
  /** Open the chat panel */
  openChat: () => void;
  /** Close the chat panel */
  closeChat: () => void;
  /** The current user ID (empty string if not logged in) */
  userId: string;
  /** Set the user ID (called on login/logout) */
  setUserId: (id: string) => void;
  /** Report a frontend rendering error back to the agent */
  sendRenderError: (error: string) => void;
  /** Currently selected model */
  selectedModel: string;
  /** Change the selected model */
  setSelectedModel: (model: string) => void;
  /** Token usage from the last agent response */
  lastUsage: TokenUsage | null;
  /** Cumulative token usage for the session */
  sessionUsage: TokenUsage | null;
}

const AgentChatContext = createContext<AgentChatContextValue | null>(null);

/**
 * Read user ID from localStorage (set by Login.tsx on sign-in).
 * Returns the user ID (may be "0" for unauthenticated/demo users).
 */
function getUserIdFromStorage(): string {
  return getUserId();
}

export function AgentChatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [userId, setUserId] = useState<string>(getUserIdFromStorage);

  const shouldReconnect = useCallback(() => isChatOpen, [isChatOpen]);
  const chat = useAgentChat({ userId, shouldReconnect });

  // Listen for login/logout events dispatched by Login.tsx and Navbar.tsx
  useEffect(() => {
    const handleLoginChange = () => {
      setUserId(getUserId());
    };

    window.addEventListener("loginStatusChanged", handleLoginChange);
    // Also listen for localStorage changes from other tabs
    window.addEventListener("storage", handleLoginChange);

    return () => {
      window.removeEventListener("loginStatusChanged", handleLoginChange);
      window.removeEventListener("storage", handleLoginChange);
    };
  }, []);

  // Auto-connect when user ID is set, disconnect when cleared
  useEffect(() => {
    if (userId) {
      chat.connect();
    } else {
      chat.disconnect();
      chat.clearMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // When user opens the chat panel and we're disconnected, connect once
  useEffect(() => {
    if (isChatOpen && userId && !chat.isConnected) {
      chat.connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatOpen, userId]);

  const toggleChat = useCallback(() => setIsChatOpen((prev) => !prev), []);
  const openChat = useCallback(() => setIsChatOpen(true), []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);

  const value = useMemo<AgentChatContextValue>(
    () => ({
      messages: chat.messages,
      status: chat.status,
      sendMessage: chat.sendMessage,
      cancelRun: chat.cancelRun,
      connect: chat.connect,
      disconnect: chat.disconnect,
      clearMessages: chat.clearMessages,
      isConnected: chat.isConnected,
      isChatOpen,
      toggleChat,
      openChat,
      closeChat,
      userId,
      setUserId,
      sendRenderError: chat.sendRenderError,
      selectedModel: chat.selectedModel,
      setSelectedModel: chat.setSelectedModel,
      lastUsage: chat.lastUsage,
      sessionUsage: chat.sessionUsage,
    }),
    [
      chat.messages,
      chat.status,
      chat.sendMessage,
      chat.sendRenderError,
      chat.cancelRun,
      chat.connect,
      chat.disconnect,
      chat.clearMessages,
      chat.isConnected,
      isChatOpen,
      toggleChat,
      openChat,
      closeChat,
      userId,
      chat.selectedModel,
      chat.setSelectedModel,
      chat.lastUsage,
      chat.sessionUsage,
    ]
  );

  return (
    <AgentChatContext.Provider value={value}>
      {children}
    </AgentChatContext.Provider>
  );
}

export function useAgentChatContext(): AgentChatContextValue {
  const ctx = useContext(AgentChatContext);
  if (!ctx) {
    throw new Error(
      "useAgentChatContext must be used within an AgentChatProvider"
    );
  }
  return ctx;
}
