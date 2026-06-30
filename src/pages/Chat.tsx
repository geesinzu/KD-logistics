import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Bot, User, Sparkles, Trash2 } from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  suggestions?: string[];
  timestamp: Date;
}

export default function Chat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem("kedi_chat");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
      } catch { /* ignore */ }
    }
    return [{
      id: "welcome",
      sender: "bot",
      text: "Hello! I'm KEDI's shipment assistant. I can help you track shipments, check delivery dates, answer questions about how things work, and more.\n\nJust ask me anything! For example:\n• \"Where is KEDI-EN2606506?\"\n• \"When will my shipment arrive?\"\n• \"How do I create a shipment?\"",
      suggestions: ["Track a shipment", "When will my shipment arrive?", "How does this work?", "List of 3PL partners"],
      timestamp: new Date(),
    }];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist chat history
  useEffect(() => {
    localStorage.setItem("kedi_chat", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const buildHistory = () => {
    return messages.slice(-6).map(m => ({ sender: m.sender, text: m.text }));
  };

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: msg,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const result = await trpc.chat.ask.useMutation().mutateAsync({
        message: msg,
        history: buildHistory(),
      });
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text: result.reply,
        suggestions: result.suggestions,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
        suggestions: ["Try again", "Help"],
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: "welcome",
      sender: "bot",
      text: "Chat cleared! How can I help you?",
      suggestions: ["Track a shipment", "Help", "How to create shipment"],
      timestamp: new Date(),
    }]);
    localStorage.removeItem("kedi_chat");
  };

  const formatText = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      const parts = line.split(/(\*\*.*?\*\*)/g);
      return (
        <span key={i}>
          {parts.map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return <strong key={j} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
            }
            return <span key={j}>{part}</span>;
          })}
          {i < lines.length - 1 && <br />}
        </span>
      );
    });
  };

  return (
    <div className="max-w-lg mx-auto flex flex-col h-[100dvh]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0F172A] text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#003B7A] rounded-full flex items-center justify-center">
              <Sparkles size={16} className="text-yellow-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold">KEDI Assistant</h1>
              <p className="text-[10px] text-green-400">Online</p>
            </div>
          </div>
        </div>
        <button onClick={clearChat} className="p-2 text-white/60 hover:text-white" title="Clear chat">
          <Trash2 size={16} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.sender === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              msg.sender === "bot" ? "bg-[#003B7A]" : "bg-gray-300"
            }`}>
              {msg.sender === "bot" ? <Bot size={16} className="text-white" /> : <User size={16} className="text-gray-600" />}
            </div>
            <div className={`max-w-[80%] ${msg.sender === "user" ? "items-end" : "items-start"}`}>
              <div className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                msg.sender === "user"
                  ? "bg-[#003B7A] text-white rounded-br-sm"
                  : "bg-white text-gray-800 shadow-sm rounded-bl-sm"
              }`}>
                {formatText(msg.text)}
              </div>
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {msg.suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => handleSend(s)}
                      className="text-xs px-3 py-1.5 bg-[#003B7A]/10 text-[#003B7A] rounded-full hover:bg-[#003B7A]/20 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-[#003B7A] flex items-center justify-center flex-shrink-0">
              <Bot size={16} className="text-white" />
            </div>
            <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 bg-white border-t flex-shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Ask me anything about your shipment..."
            className="flex-1 h-11 px-4 rounded-full border border-gray-200 text-sm focus:outline-none focus:border-[#003B7A]"
            disabled={loading}
          />
          <Button
            size="icon"
            className="h-11 w-11 rounded-full bg-[#003B7A] hover:bg-[#002B5A] flex-shrink-0"
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
