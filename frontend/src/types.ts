export type ChatRole = "user" | "assistant"

export interface ChatMessage {
    role: ChatRole
    content: string
}

// Eventos que a API envia em streaming (Server-Sent Events).
export type StreamEvent =
    | { type: "text"; data: string }
    | { type: "tool"; name: string }
    | { type: "error"; message: string }
    | { type: "done" }
