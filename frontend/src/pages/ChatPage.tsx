import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { fetchConversas, sendChat, UnauthorizedError } from "../lib/api"
import type { ChatMessage, StreamEvent } from "../types"
import "./Chat.css"

const TOOL_LABELS: Record<string, string> = {
    listar_catalogo: "consultando catálogo…",
    registrar_intencao: "registrando intenção de compra…",
    realizar_compra: "processando pagamento…",
}

interface Props {
    onSignOut: () => void
}

function ChatPage({ onSignOut }: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState("")
    const [loading, setLoading] = useState(false)
    const [toolLabel, setToolLabel] = useState<string | null>(null)
    const bottomRef = useRef<HTMLDivElement>(null)

    // Carrega o histórico salvo no servidor (GET /conversas).
    useEffect(() => {
        fetchConversas()
            .then(setMessages)
            .catch((err) => {
                if (err instanceof UnauthorizedError) onSignOut()
            })
    }, [])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, toolLabel])

    async function handleSend() {
        const text = input.trim()
        if (!text || loading) return

        // Mostra a fala do usuário e uma bolha vazia do assistente, que vai sendo preenchida pelo streaming.
        setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }])
        setInput("")
        setLoading(true)
        setToolLabel(null)

        const onEvent = (event: StreamEvent) => {
            if (event.type === "text") {
                setToolLabel(null)
                setMessages((prev) => {
                    const copy = [...prev]
                    const last = copy[copy.length - 1]
                    copy[copy.length - 1] = { ...last, content: last.content + event.data }
                    return copy
                })
            } else if (event.type === "tool") {
                setToolLabel(TOOL_LABELS[event.name] ?? `executando ${event.name}…`)
            } else if (event.type === "error") {
                setMessages((prev) => {
                    const copy = [...prev]
                    copy[copy.length - 1] = { role: "assistant", content: event.message }
                    return copy
                })
            }
        }

        try {
            await sendChat(text, onEvent)
        } catch (err) {
            if (err instanceof UnauthorizedError) {
                onSignOut()
                return
            }
            onEvent({ type: "error", message: "Erro ao falar com o servidor. Tente novamente." })
        } finally {
            setLoading(false)
            setToolLabel(null)
        }
    }

    return (
        <div className="chat-page">
            <header className="chat-header">
                <span className="brand">◈ assistente de compras</span>
                <div className="chat-header-right">
                    <button className="logout-btn" onClick={onSignOut}>
                        Sair
                    </button>
                </div>
            </header>

            <div className="chat-messages">
                {messages.map((m, i) => (
                    <div key={i} className={`bubble bubble-${m.role}`}>
                        {m.role === "assistant" && m.content === "" ? (
                            <span>{toolLabel ? `🔧 ${toolLabel}` : "…"}</span>
                        ) : (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        )}
                    </div>
                ))}
                {toolLabel && messages[messages.length - 1]?.content !== "" && (
                    <div className="bubble bubble-assistant">🔧 {toolLabel}</div>
                )}
                <div ref={bottomRef} />
            </div>

            <div className="chat-input">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Pergunte o que temos à venda…"
                    disabled={loading}
                />
                <button onClick={handleSend} disabled={loading}>
                    Enviar
                </button>
            </div>
        </div>
    )
}

export default ChatPage
