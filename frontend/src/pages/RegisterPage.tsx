import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { register as registerRequest } from "../lib/api"
import { useAuth } from "../lib/auth"
import "./Auth.css"

function RegisterPage() {
    const [name, setName] = useState("")
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
            const token = await registerRequest(name, email, password)
            login(token)
            navigate("/chat")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro ao criar conta.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="auth-page">
            <form className="auth-card" onSubmit={handleSubmit}>
                <span className="brand">◈ assistente de compras</span>
                <h1>Criar conta</h1>

                <label htmlFor="name">Nome</label>
                <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />

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
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                />

                {error && <div className="form-error">{error}</div>}

                <button type="submit" disabled={loading}>
                    {loading ? "Criando..." : "Criar conta"}
                </button>

                <p className="hint">
                    Já tem conta? <Link to="/login">Entrar</Link>
                </p>
            </form>
        </main>
    )
}

export default RegisterPage
