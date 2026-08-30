import { createContext, useContext, useState, type ReactNode } from "react"
import { Navigate } from "react-router-dom"

const TOKEN_KEY = "auth_token"

function readToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
}

interface AuthContextValue {
    token: string | null
    login: (token: string) => void
    logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [token, setToken] = useState<string | null>(readToken())

    function login(newToken: string) {
        localStorage.setItem(TOKEN_KEY, newToken)
        setToken(newToken)
    }

    function logout() {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
    }

    return <AuthContext.Provider value={{ token, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>")
    return ctx
}

// Envolve uma rota que exige login. Sem token, redireciona pro /login.
export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { token } = useAuth()
    if (!token) return <Navigate to="/login" replace />
    return <>{children}</>
}
