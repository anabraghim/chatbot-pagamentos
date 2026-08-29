import { useState } from "react"
import "./App.css"
import { sendChat } from "./api"
import type { ChatMessage, ToolCall } from "./types"

const TOOL_LABELS: Record<string, string> = {
    listar_catalogo: "consultando catálogo…",
    registrar_intencao: "registrando intenção de compra…",
    realizar_compra: "processando pagamento…",
}

function toolCallLabel(toolCalls: ToolCall[]) {
    const labels = toolCalls.map((call) => TOOL_LABELS[call.function.name] ?? `executando ${call.function.name}…`)
    return `🔧 ${[...new Set(labels)].join(" ")}`
}

function App() {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState("")
    const [loading, setLoading] = useState(false)

    async function handleSend() {
        const text = input.trim()
        if (!text || loading) return

        const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }]
        setMessages(nextMessages)
        setInput("")
        setLoading(true)

        try {
            const updated = await sendChat(nextMessages)
            setMessages(updated)
        } catch (err) {
            setMessages([
                ...nextMessages,
                { role: "assistant", content: "Erro ao falar com o servidor. Tente novamente." },
            ])
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="chat">
            <h1>Chat da loja</h1>
            <div className="chat-messages">
                {messages
                    .filter((m) => m.role !== "tool")
                    .map((m, i) => (
                        <div key={i} className={`bubble bubble-${m.role}`}>
                            {m.tool_calls && m.tool_calls.length > 0
                                ? toolCallLabel(m.tool_calls)
                                : m.content}
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

export default App
