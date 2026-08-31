import type { ChatMessage } from "../types"

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

function authHeaders(token: string) {
    return { Authorization: `Bearer ${token}` }
}

export async function register(name: string, email: string, password: string): Promise<string> {
    const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? "Não foi possível criar a conta.")
    return data.token as string
}

export async function login(email: string, password: string): Promise<string> {
    const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? "E-mail ou senha inválidos.")
    return data.token as string
}

export interface Profile {
    name: string
    email: string
    spendingLimit: number
}

export async function fetchProfile(token: string): Promise<Profile> {
    const res = await fetch(`${API_URL}/auth/me`, { headers: authHeaders(token) })
    if (!res.ok) throw new Error("Não foi possível carregar o perfil.")
    return res.json()
}

// Lançada quando o backend responde 401 — quem chama decide o que fazer
// (no ChatPage, isso dispara o logout automático).
export class UnauthorizedError extends Error {}

export async function sendChat(messages: ChatMessage[], token: string): Promise<ChatMessage[]> {
    const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ messages }),
    })
    if (res.status === 401) throw new UnauthorizedError()
    if (!res.ok) throw new Error(`Chat request failed: ${res.status}`)
    const data = await res.json()
    return data.messages as ChatMessage[]
}
