import type { ChatMessage } from "./types"

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

export async function sendChat(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
    })
    if (!res.ok) throw new Error(`Chat request failed: ${res.status}`)
    const data = await res.json()
    return data.messages as ChatMessage[]
}
