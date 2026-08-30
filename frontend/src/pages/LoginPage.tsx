import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { login as loginRequest } from "../lib/api"
import { useAuth } from "../lib/auth"
import "./Auth.css"

function LoginPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const { login } = useAuth()
    const navigate = useNavigate()

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const token = await loginRequest(email, password)
            login(token)
            navigate("/chat")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro ao entrar.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="auth-page">
            <form className="auth-card" onSubmit={handleSubmit}>
                <span className="brand">◈ assistente de compras</span>
                <h1>Entrar na sua conta</h1>

                <label htmlFor="email">E-mail</label>
                <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                />

                <label htmlFor="password">Senha</label>
                <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                />

                {error && <div className="form-error">{error}</div>}

                <button type="submit" disabled={loading}>
                    {loading ? "Entrando..." : "Entrar"}
                </button>

                <p className="hint">
                    Ainda não tem conta? <Link to="/register">Criar conta</Link>
                </p>
            </form>
        </main>
    )
}

export default LoginPage
