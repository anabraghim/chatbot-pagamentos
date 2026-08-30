import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { fetchProfile, sendChat, UnauthorizedError, type Profile } from "../lib/api"
import { useAuth } from "../lib/auth"
import type { ChatMessage, ToolCall } from "../types"
import "./Chat.css"

const TOOL_LABELS: Record<string, string> = {
    listar_catalogo: "consultando catálogo…",
    registrar_intencao: "registrando intenção de compra…",
    realizar_compra: "processando pagamento…",
}

function toolCallLabel(toolCalls: ToolCall[]) {
    const labels = toolCalls.map((call) => TOOL_LABELS[call.function.name] ?? `executando ${call.function.name}…`)
    return `🔧 ${[...new Set(labels)].join(" ")}`
}

function ChatPage() {
    const { token, logout } = useAuth()
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState("")
    const [loading, setLoading] = useState(false)
    const [profile, setProfile] = useState<Profile | null>(null)

    useEffect(() => {
        if (!token) return
        fetchProfile(token)
            .then(setProfile)
            .catch(() => {
                // /auth/me é só decoração do cabeçalho — se falhar, o chat continua normal.
            })
    }, [token])

    async function handleSend() {
        const text = input.trim()
        if (!text || loading || !token) return

        const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }]
        setMessages(nextMessages)
        setInput("")
        setLoading(true)

        try {
            const updated = await sendChat(nextMessages, token)
            setMessages(updated)
            // O limite pode ter mudado se essa mensagem completou uma compra.
            fetchProfile(token).then(setProfile).catch(() => {})
        } catch (err) {
            if (err instanceof UnauthorizedError) {
                logout()
                return
            }
            setMessages([
                ...nextMessages,
                { role: "assistant", content: "Erro ao falar com o servidor. Tente novamente." },
            ])
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="chat-page">
            <header className="chat-header">
                <span className="brand">◈ assistente de compras</span>
                <div className="chat-header-right">
                    {profile && (
                        <span className="limit-pill">
                            limite:{" "}
                            {profile.spendingLimit.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                            })}
                        </span>
                    )}
                    {profile && <span className="username">{profile.name}</span>}
                    <button className="logout-btn" onClick={logout}>
                        Sair
                    </button>
                </div>
            </header>

            <div className="chat-messages">
                {messages
                    .filter((m) => m.role !== "tool")
                    .map((m, i) => (
                        <div key={i} className={`bubble bubble-${m.role}`}>
                            {m.tool_calls && m.tool_calls.length > 0 ? (
                                toolCallLabel(m.tool_calls)
                            ) : (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content ?? ""}</ReactMarkdown>
                            )}
                        </div>
                    ))}
                {loading && <div className="bubble bubble-assistant">…</div>}
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
