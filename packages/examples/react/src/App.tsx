import { useCallback, useEffect, useRef, useState } from "react";
import {
  getGreeting,
  getRuntime,
  isRuntimeInitialized,
  sendMessage,
} from "./tokagent-runtime";
import "./App.css";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isBooted, setIsBooted] = useState(false);
  const [bootStatus, setBootStatus] = useState("Initializing...");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTokagentMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `tokagent-${Date.now()}`,
        text,
        isUser: false,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Boot sequence - initialize the AgentRuntime
  useEffect(() => {
    let mounted = true;

    const initializeTokagent = async () => {
      setBootStatus("Loading tokagentOS runtime...");

      // Initialize the AgentRuntime
      await getRuntime();

      if (!mounted) return;

      setBootStatus("Runtime initialized");
      setIsBooted(true);

      // Add initial greeting after boot
      setTimeout(() => {
        if (mounted) {
          addTokagentMessage(getGreeting());
        }
      }, 500);
    };

    initializeTokagent();

    return () => {
      mounted = false;
    };
  }, [addTokagentMessage]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, []);

  // Focus input after boot
  useEffect(() => {
    if (isBooted && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isBooted]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const text = inputValue.trim();
      if (!text || isTyping) return;

      // Add user message
      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          text,
          isUser: true,
          timestamp: new Date(),
        },
      ]);
      setInputValue("");
      setIsTyping(true);

      // Send message through tokagentOS runtime
      const response = await sendMessage(text);
      addTokagentMessage(response);
      setIsTyping(false);
    },
    [inputValue, isTyping, addTokagentMessage],
  );

  return (
    <div className="crt-monitor">
      <div className={`crt-screen ${isBooted ? "booted" : ""}`}>
        {/* Scanlines overlay */}
        <div className="scanlines" />

        {/* Screen glow */}
        <div className="screen-glow" />

        <div className="terminal">
          {/* Header */}
          <header className="terminal-header">
            <h1 className="title">TOKAGENT</h1>
            <div className="subtitle">Rogerian Psychotherapist Simulation</div>
            <div className="meta">MIT AI Lab • 1966 • Joseph Weizenbaum</div>
          </header>

          {/* Status bar */}
          <div className="status-bar">
            <div className="status-item">
              <span
                className={`status-indicator ${isBooted ? "online" : "loading"}`}
              />
              <span>{isBooted ? "System Ready" : bootStatus}</span>
            </div>
            <div className="status-item">
              <span>
                {isRuntimeInitialized()
                  ? "tokagentOS Runtime Active"
                  : "tokagentOS React Demo"}
              </span>
            </div>
          </div>

          {/* Boot message */}
          <div className="boot-message">
            <div className="boot-line">
              ═══════════════════════════════════════
            </div>
            <div className="boot-line">tokagentOS Agent Runtime Loaded</div>
            <div className="boot-line">Pattern matching engine: ACTIVE</div>
            <div className="boot-line">
              Database: PGlite (in-browser WASM Postgres)
            </div>
            <div className="boot-line">Mode: Classic TOKAGENT (No LLM)</div>
            <div className="boot-line">
              ═══════════════════════════════════════
            </div>
          </div>

          {/* Chat container */}
          <div className="chat-container" ref={chatContainerRef}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message ${message.isUser ? "user" : "tokagent"}`}
              >
                <span className="message-label">
                  {message.isUser ? "YOU" : "TOKAGENT"}:
                </span>
                <span className="message-text">{message.text}</span>
              </div>
            ))}

            {isTyping && (
              <div className="message tokagent typing">
                <span className="message-label">TOKAGENT:</span>
                <span className="typing-dots">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </div>
            )}
          </div>

          {/* Input area */}
          <form className="input-area" onSubmit={handleSubmit}>
            <span className="prompt-symbol">{">"}</span>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Tell me what's troubling you..."
              disabled={!isBooted || isTyping}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={!isBooted || isTyping || !inputValue.trim()}
            >
              SEND
            </button>
          </form>

          {/* Footer */}
          <div className="terminal-footer">
            Powered by tokagentOS • Classic TOKAGENT pattern matching • No server
            required
          </div>
        </div>
      </div>

      {/* Monitor bezel details */}
      <div className="led-container">
        <div className="led power" />
        <div className={`led activity ${isTyping ? "blinking" : ""}`} />
      </div>
      <span className="brand-plate">tokagentOS</span>
    </div>
  );
}

export default App;
