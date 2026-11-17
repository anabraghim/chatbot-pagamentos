import { fetchAuthSession } from "aws-amplify/auth"
import type { ChatMessage, StreamEvent } from "../types"

const API_URL = import.meta.env.VITE_API_URL as string

// Lançada quando o API Gateway responde 401 (token ausente, inválido ou expirado).
export class UnauthorizedError extends Error {}

// O token do Cognito (ID token) é renovado automaticamente pelo Amplify quando expira.
async function authHeader(): Promise<Record<string, string>> {
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()
    if (!token) throw new UnauthorizedError()
    return { Authorization: `Bearer ${token}` }
}

export async function fetchConversas(): Promise<ChatMessage[]> {
    const res = await fetch(`${API_URL}/conversas`, { headers: await authHeader() })
    if (res.status === 401) throw new UnauthorizedError()
    if (!res.ok) throw new Error(`Falha ao carregar a conversa: ${res.status}`)
    const data = await res.json()
    return data.messages as ChatMessage[]
}

// Envia UMA mensagem; o histórico fica no servidor (DynamoDB). A resposta chega em streaming.
export async function sendChat(message: string, onEvent: (event: StreamEvent) => void): Promise<void> {
    const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ message }),
    })
    if (res.status === 401) throw new UnauthorizedError()
    if (!res.ok || !res.body) throw new Error(`Falha na requisição: ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Cada evento SSE termina com uma linha em branco.
        const partes = buffer.split("\n\n")
        buffer = partes.pop() ?? ""
        for (const parte of partes) {
            const linha = parte.split("\n").find((l) => l.startsWith("data:"))
            if (!linha) continue
            try {
                onEvent(JSON.parse(linha.slice(5).trim()) as StreamEvent)
            } catch {
                // linha incompleta ou inválida: ignora
            }
        }
    }
}
