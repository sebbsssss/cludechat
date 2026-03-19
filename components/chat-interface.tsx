"use client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Brain, Link, Folder, Mic, Send, Plus, Trash2, Shield, ShieldAlert, Wallet, LogOut } from "lucide-react"
import { LiquidMetal, PulsingBorder } from "@paper-design/shaders-react"
import { motion, AnimatePresence } from "framer-motion"
import { useState, useRef, useEffect, useCallback } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useSolanaWallets } from "@privy-io/react-auth/solana"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://clude.io"
const FREE_MESSAGE_LIMIT = 10

// ---- Types ---- //

interface Message {
  id: string
  content: string
  role: "user" | "assistant"
  timestamp: Date
  model?: string
  memories_used?: number
}

interface Conversation {
  id: string
  title: string | null
  model: string
  message_count: number
  created_at: string
  updated_at: string
}

interface ChatModel {
  id: string
  name: string
  veniceId: string
  privacy: "private" | "anonymized"
  context: number
  default?: boolean
}

// ---- Shader Avatar Component ---- //

function CludeAvatar({ size = 32 }: { size?: number }) {
  const glowSize = size * 1.2
  const innerSize = size * 0.75
  const dotSize = Math.max(1, size / 16)

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className="z-10 absolute rounded-full backdrop-blur-[2px]"
        style={{
          width: innerSize,
          height: innerSize,
          background: "rgba(255,255,255,0.05)",
        }}
      >
        <div className="bg-white rounded-full absolute blur-[0.5px]" style={{ width: dotSize, height: dotSize, top: "30%", left: "30%" }} />
        <div className="bg-white rounded-full absolute blur-[0.4px]" style={{ width: dotSize, height: dotSize, top: "22%", left: "55%" }} />
        <div className="bg-white rounded-full absolute blur-[0.5px]" style={{ width: dotSize, height: dotSize, top: "60%", left: "15%" }} />
        {size > 40 && (
          <>
            <div className="bg-white rounded-full absolute blur-[0.8px]" style={{ width: dotSize, height: dotSize, top: "38%", left: "72%" }} />
            <div className="bg-white rounded-full absolute blur-[1px]" style={{ width: dotSize, height: dotSize, top: "58%", left: "58%" }} />
          </>
        )}
      </div>
      <LiquidMetal
        style={{ height: glowSize, width: glowSize, filter: `blur(${Math.max(4, size / 5)}px)`, position: "absolute" }}
        colorBack="hsl(0, 0%, 0%, 0)"
        colorTint="hsl(220, 100%, 45%)"
        repetition={4}
        softness={0.5}
        shiftRed={0.05}
        shiftBlue={0.6}
        distortion={0.1}
        contour={1}
        shape="circle"
        offsetX={0}
        offsetY={0}
        scale={0.58}
        rotation={50}
        speed={5}
      />
      <LiquidMetal
        style={{ height: glowSize, width: glowSize }}
        colorBack="hsl(0, 0%, 0%, 0)"
        colorTint="hsl(220, 100%, 45%)"
        repetition={4}
        softness={0.5}
        shiftRed={0.05}
        shiftBlue={0.6}
        distortion={0.1}
        contour={1}
        shape="circle"
        offsetX={0}
        offsetY={0}
        scale={0.58}
        rotation={50}
        speed={5}
      />
    </div>
  )
}

// ---- Main Component ---- //

export function ChatInterface() {
  const { authenticated, login, logout: privyLogout, ready } = usePrivy()
  const { wallets: solanaWallets } = useSolanaWallets()
  const walletAddress = solanaWallets?.[0]?.address || null

  const [isFocused, setIsFocused] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [models, setModels] = useState<ChatModel[]>([])
  const [selectedModel, setSelectedModel] = useState("qwen3-5-9b")
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [showSidebar, setShowSidebar] = useState(false)
  const [guestCount, setGuestCount] = useState(0)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isGuest = !apiKey && !authenticated
  const remainingFree = Math.max(0, FREE_MESSAGE_LIMIT - guestCount)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Load API key and guest count from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("clude_chat_api_key")
    if (saved) setApiKey(saved)
    const count = parseInt(localStorage.getItem("clude_guest_count") || "0")
    setGuestCount(count)
  }, [])

  // When wallet connects via Privy, auto-register a cortex API key
  useEffect(() => {
    if (authenticated && walletAddress && !apiKey) {
      // Try to register or use existing key
      const savedKey = localStorage.getItem("clude_chat_api_key")
      if (savedKey) {
        setApiKey(savedKey)
        return
      }
      // Auto-register
      fetch(`${API_BASE}/api/cortex/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `chat-${walletAddress.slice(0, 8)}`, wallet: walletAddress }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.apiKey) {
            setApiKey(data.apiKey)
            localStorage.setItem("clude_chat_api_key", data.apiKey)
          } else if (data.error?.includes("already registered")) {
            // Wallet already registered — prompt for key
            const key = prompt("Your wallet is already registered. Enter your API key (clk_...):")
            if (key) {
              setApiKey(key)
              localStorage.setItem("clude_chat_api_key", key)
            }
          }
        })
        .catch(() => {})
    }
  }, [authenticated, walletAddress, apiKey])

  // Fetch models
  useEffect(() => {
    fetch(`${API_BASE}/api/chat/models`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setModels(data)
      })
      .catch(() => {})
  }, [])

  // Fetch conversations when API key is set
  useEffect(() => {
    if (!apiKey) return
    fetch(`${API_BASE}/api/chat/conversations?limit=20`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setConversations(data)
      })
      .catch(() => {})
  }, [apiKey])

  const createConversation = useCallback(async (): Promise<string | null> => {
    if (!apiKey) return null
    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: selectedModel }),
      })
      const data = await res.json()
      if (data.id) {
        setConversationId(data.id)
        return data.id
      }
    } catch {}
    return null
  }, [apiKey, selectedModel])

  const loadConversation = useCallback(async (id: string) => {
    if (!apiKey) return
    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations/${id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      const data = await res.json()
      if (data.messages) {
        setConversationId(id)
        setMessages(
          data.messages
            .filter((m: any) => m.role !== "system")
            .map((m: any) => ({
              id: m.id,
              content: m.content,
              role: m.role,
              timestamp: new Date(m.created_at),
              model: m.model,
            }))
        )
        if (data.model) setSelectedModel(data.model)
      }
    } catch {}
  }, [apiKey])

  const deleteConversation = useCallback(async (id: string) => {
    if (!apiKey) return
    try {
      await fetch(`${API_BASE}/api/chat/conversations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      setConversations(prev => prev.filter(c => c.id !== id))
      if (conversationId === id) {
        setConversationId(null)
        setMessages([])
      }
    } catch {}
  }, [apiKey, conversationId])

  const handleSend = async () => {
    if (!inputValue.trim() || isTyping) return

    // Check if guest limit reached
    if (isGuest && guestCount >= FREE_MESSAGE_LIMIT) {
      setShowAuthPrompt(true)
      return
    }

    const userContent = inputValue.trim()
    const userMessage: Message = {
      id: Date.now().toString(),
      content: userContent,
      role: "user",
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue("")
    setIsTyping(true)

    // Auto-resize textarea back
    if (textareaRef.current) {
      textareaRef.current.style.height = "80px"
    }

    try {
      let res: Response

      if (isGuest) {
        // Guest mode — no auth, no memory, limited model
        const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
        res = await fetch(`${API_BASE}/api/chat/guest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: userContent, history }),
        })

        // Track guest usage
        const newCount = guestCount + 1
        setGuestCount(newCount)
        localStorage.setItem("clude_guest_count", String(newCount))

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }))
          if (err.requireAuth) {
            setShowAuthPrompt(true)
          }
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            content: err.error || "Request failed",
            role: "assistant",
            timestamp: new Date(),
          }])
          setIsTyping(false)
          return
        }
      } else {
        // Authenticated mode — full features
        // Create conversation if needed
        let convId = conversationId
        if (!convId) {
          convId = await createConversation()
          if (!convId) {
            setIsTyping(false)
            return
          }
        }

        res = await fetch(`${API_BASE}/api/chat/conversations/${convId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ content: userContent, model: selectedModel }),
        })
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }))
        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            content: `Error: ${err.error || res.statusText}`,
            role: "assistant",
            timestamp: new Date(),
          },
        ])
        setIsTyping(false)
        return
      }

      // Stream SSE response
      const reader = res.body?.getReader()
      if (!reader) {
        setIsTyping(false)
        return
      }

      const assistantId = (Date.now() + 1).toString()
      let fullContent = ""

      // Add empty assistant message
      setMessages(prev => [
        ...prev,
        { id: assistantId, content: "", role: "assistant", timestamp: new Date(), model: selectedModel },
      ])
      setIsTyping(false)

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith("data: ")) continue

          const data = trimmed.slice(6)
          if (data === "[DONE]") continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.content) {
              fullContent += parsed.content
              setMessages(prev =>
                prev.map(m => (m.id === assistantId ? { ...m, content: fullContent } : m))
              )
            }
            if (parsed.done) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, id: parsed.message_id || m.id, memories_used: parsed.memories_used }
                    : m
                )
              )
            }
            if (parsed.error) {
              setMessages(prev =>
                prev.map(m => (m.id === assistantId ? { ...m, content: `Error: ${parsed.error}` } : m))
              )
            }
          } catch {}
        }
      }

      // Refresh conversation list
      fetch(`${API_BASE}/api/chat/conversations?limit=20`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) setConversations(data)
        })
        .catch(() => {})
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          content: "Error: Failed to connect to Clude. Please try again.",
          role: "assistant",
          timestamp: new Date(),
        },
      ])
      setIsTyping(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleNewChat = () => {
    setConversationId(null)
    setMessages([])
  }

  const hasMessages = messages.length > 0
  const currentModel = models.find(m => m.id === selectedModel)

  return (
    <div className="flex flex-col h-screen p-4">
      <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col">

        {/* Auth prompt overlay */}
        <AnimatePresence>
          {showAuthPrompt && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
              onClick={() => setShowAuthPrompt(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-md mx-4"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-center mb-4">
                  <CludeAvatar size={48} />
                </div>
                <h2 className="text-white text-lg font-semibold text-center mb-2">
                  Unlock Persistent Memory
                </h2>
                <p className="text-zinc-400 text-sm text-center mb-6 leading-relaxed">
                  Sign in to get unlimited messages, memory across conversations, and access to all models.
                </p>
                <button
                  onClick={() => { login(); setShowAuthPrompt(false); }}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-3 px-4 font-medium transition-colors mb-3"
                >
                  <Wallet className="h-4 w-4" />
                  Connect Wallet
                </button>
                <button
                  onClick={() => {
                    const key = prompt("Enter your Clude API key (clk_...):")
                    if (key) {
                      setApiKey(key)
                      localStorage.setItem("clude_chat_api_key", key)
                      setShowAuthPrompt(false)
                    }
                  }}
                  className="w-full text-zinc-500 hover:text-zinc-300 text-sm py-2 transition-colors"
                >
                  Or enter API key
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {apiKey && (
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="text-zinc-500 hover:text-white text-xs uppercase tracking-widest transition-colors"
              >
                {showSidebar ? "Close" : "History"}
              </button>
            )}
            {isGuest && (
              <span className="text-[10px] text-zinc-500">
                {remainingFree} free messages left
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentModel && (
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                currentModel.privacy === "private"
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : "text-amber-400 border-amber-500/30 bg-amber-500/10"
              }`}>
                {currentModel.privacy === "private" ? "Private" : "Anonymized"}
              </span>
            )}
            {apiKey && (
              <button
                onClick={handleNewChat}
                className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-zinc-800"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
            {isGuest ? (
              <button
                onClick={() => setShowAuthPrompt(true)}
                className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs transition-colors"
              >
                <Wallet className="h-3.5 w-3.5" />
                Sign In
              </button>
            ) : walletAddress ? (
              <button
                onClick={() => { privyLogout(); setApiKey(""); localStorage.removeItem("clude_chat_api_key"); }}
                className="flex items-center gap-1.5 text-zinc-500 hover:text-white text-xs transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
              </button>
            ) : apiKey ? (
              <button
                onClick={() => { setApiKey(""); localStorage.removeItem("clude_chat_api_key"); setMessages([]); setConversationId(null); }}
                className="flex items-center gap-1.5 text-zinc-500 hover:text-white text-xs transition-colors"
              >
                <LogOut className="h-3 w-3" />
                Sign Out
              </button>
            ) : null}
          </div>
        </div>

        {/* Conversation sidebar */}
        <AnimatePresence>
          {showSidebar && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 overflow-hidden"
            >
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 max-h-[200px] overflow-y-auto space-y-1">
                {conversations.length === 0 && (
                  <p className="text-zinc-600 text-xs text-center py-4">No conversations yet</p>
                )}
                {conversations.map(conv => (
                  <div
                    key={conv.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
                      conv.id === conversationId
                        ? "bg-blue-600/15 text-white"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    }`}
                    onClick={() => loadConversation(conv.id)}
                  >
                    <span className="truncate flex-1 mr-2">
                      {conv.title || "Untitled"}
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        deleteConversation(conv.id)
                      }}
                      className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages Area */}
        <AnimatePresence mode="wait">
          {hasMessages && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex-1 overflow-y-auto mb-4 space-y-5 max-h-[60vh] pr-2"
            >
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    duration: 0.4,
                    ease: [0.25, 0.46, 0.45, 0.94],
                    delay: index === messages.length - 1 ? 0.05 : 0,
                  }}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <div className="flex items-start gap-3">
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.1, type: "spring", stiffness: 300, damping: 20 }}
                      >
                        <CludeAvatar size={32} />
                      </motion.div>
                      <div className="bg-zinc-900/80 border border-blue-500/20 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%]">
                        <p className="text-white/90 text-sm whitespace-pre-wrap">{message.content || "..."}</p>
                        {message.memories_used && message.memories_used > 0 && (
                          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/5">
                            <Brain className="h-3 w-3 text-blue-400/60" />
                            <span className="text-[10px] text-blue-400/60">{message.memories_used} memories recalled</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {message.role === "user" && (
                    <motion.div
                      className="bg-blue-600/20 border border-blue-500/30 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]"
                    >
                      <p className="text-white text-sm whitespace-pre-wrap">{message.content}</p>
                    </motion.div>
                  )}
                </motion.div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex justify-start"
                >
                  <div className="flex items-start gap-3">
                    <CludeAvatar size={32} />
                    <div className="bg-zinc-900/80 border border-blue-500/20 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1">
                        <motion.div
                          className="w-2 h-2 bg-blue-500/60 rounded-full"
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                        />
                        <motion.div
                          className="w-2 h-2 bg-blue-500/60 rounded-full"
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                        />
                        <motion.div
                          className="w-2 h-2 bg-blue-500/60 rounded-full"
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spacer to push welcome + input to bottom */}
        {!hasMessages && <div className="flex-1" />}

        {/* Welcome state */}
        <AnimatePresence>
          {!hasMessages && (
            <motion.div
              className="flex flex-row items-center gap-3 mb-4"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.95, filter: "blur(8px)" }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            >
              <motion.div
                id="circle-ball"
                className="relative flex items-center justify-center z-10"
                animate={{
                  y: isFocused ? 50 : 0,
                  opacity: isFocused ? 0 : 100,
                  filter: isFocused ? "blur(4px)" : "blur(0px)",
                  rotation: isFocused ? 180 : 0,
                }}
                transition={{
                  duration: 0.5,
                  type: "spring",
                  stiffness: 200,
                  damping: 20,
                }}
              >
                <CludeAvatar size={40} />
              </motion.div>

              <motion.p
                className="text-white/40 text-sm font-light z-10"
                animate={{
                  y: isFocused ? 50 : 0,
                  opacity: isFocused ? 0 : 100,
                  filter: isFocused ? "blur(4px)" : "blur(0px)",
                }}
                transition={{
                  duration: 0.5,
                  type: "spring",
                  stiffness: 200,
                  damping: 20,
                }}
              >
                I'm Clude — your personal AI assistant with persistent memory
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input area */}
        <div className="relative">
          <motion.div
            className="absolute w-full h-full z-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: isFocused ? 1 : 0 }}
            transition={{ duration: 0.8 }}
          >
            <PulsingBorder
              style={{ height: "146.5%", minWidth: "143%" }}
              colorBack="hsl(0, 0%, 0%)"
              roundness={0.18}
              thickness={0}
              softness={0}
              intensity={0.3}
              bloom={2}
              spots={2}
              spotSize={0.25}
              pulse={0}
              smoke={0.35}
              smokeSize={0.4}
              scale={0.7}
              rotation={0}
              offsetX={0}
              offsetY={0}
              speed={1}
              colors={[
                "hsl(220, 100%, 30%)",
                "hsl(210, 100%, 50%)",
                "hsl(230, 60%, 20%)",
                "hsl(215, 100%, 40%)",
                "hsl(230, 80%, 8%)",
              ]}
            />
          </motion.div>

          <motion.div
            className="relative bg-[#040404] rounded-2xl p-4 z-10"
            animate={{
              borderColor: isFocused ? "#1E50E6" : "#3D3D3D",
            }}
            transition={{ duration: 0.6, delay: 0.1 }}
            style={{ borderWidth: "1px", borderStyle: "solid" }}
          >
            <div className="relative mb-6">
              <Textarea
                ref={textareaRef}
                placeholder="Ask me anything..."
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[80px] resize-none bg-transparent border-none text-white text-base placeholder:text-zinc-500 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none [&:focus]:ring-0 [&:focus]:outline-none [&:focus-visible]:ring-0 [&:focus-visible]:outline-none"
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 hover:text-white p-0"
                  title="Memory recall active"
                >
                  <Brain className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white p-0"
                >
                  <Link className="h-4 w-4" />
                </Button>

                {/* Model selector with privacy labels */}
                <div className="flex items-center">
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="bg-zinc-900 border-[#3D3D3D] text-white hover:bg-zinc-700 text-xs rounded-full px-2 h-8 min-w-[180px]">
                      <div className="flex items-center gap-2">
                        {currentModel?.privacy === "private" ? (
                          <Shield className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <ShieldAlert className="h-3 w-3 text-amber-400" />
                        )}
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 z-30 border-[#3D3D3D] rounded-xl max-h-[300px]">
                      {/* Private models */}
                      <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-emerald-400/70 font-semibold">
                        Private — Zero Data Retention
                      </div>
                      {models.filter(m => m.privacy === "private").map(m => (
                        <SelectItem key={m.id} value={m.id} className="text-white hover:bg-zinc-700 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Shield className="h-3 w-3 text-emerald-400/70" />
                            <span>{m.name}</span>
                            <span className="text-[9px] uppercase tracking-wider text-emerald-400/60 border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 rounded-full ml-auto">Private</span>
                          </div>
                        </SelectItem>
                      ))}
                      {/* Anonymized models */}
                      <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-amber-400/70 font-semibold mt-1">
                        Anonymized — Via Third-Party
                      </div>
                      {models.filter(m => m.privacy === "anonymized").map(m => (
                        <SelectItem key={m.id} value={m.id} className="text-white hover:bg-zinc-700 rounded-lg">
                          <div className="flex items-center gap-2">
                            <ShieldAlert className="h-3 w-3 text-amber-400/70" />
                            <span>{m.name}</span>
                            <span className="text-[9px] uppercase tracking-wider text-amber-400/60 border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 rounded-full ml-auto">Anonymized</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white p-0"
                >
                  <Folder className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white p-0"
                >
                  <Mic className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isTyping}
                  className="h-10 w-10 rounded-full bg-blue-600/25 hover:bg-blue-600/35 text-blue-500 p-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
