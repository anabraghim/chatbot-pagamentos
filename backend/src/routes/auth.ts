import { Hono } from "hono"
import { sValidator } from "@hono/standard-validator"
import { z } from "zod"
import { sign } from "hono/jwt"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { db } from "../db/db.ts"
import { UsersTable } from "../db/schema.ts"
import { env } from "../data/env.ts"
import { requireAuth, type AuthEnv } from "../middleware/auth.ts"

const registerSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
})

const loginSchema = z.object({
    email: z.string().min(1),
    password: z.string().min(1),
})

const app = new Hono<AuthEnv>()

// Limite inicial dado a quem se cadastra pelo formulário. O usuário demo
// do seed continua com 5000, pra não quebrar os testes de LIMITE_EXCEDIDO
// documentados no README.
const DEFAULT_SPENDING_LIMIT = 500

app.post("/register", sValidator("json", registerSchema), async (c) => {
    const { name, email, password } = c.req.valid("json")

    const existing = await db.select().from(UsersTable).where(eq(UsersTable.email, email)).limit(1)
    if (existing.length > 0) {
        return c.json({ error: "E-mail já cadastrado" }, 409)
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const [user] = await db
        .insert(UsersTable)
        .values({ name, email, passwordHash, spendingLimit: DEFAULT_SPENDING_LIMIT })
        .returning()

    const token = await sign({ sub: user.id, email: user.email }, env.JWT_SECRET)
    return c.json({ token }, 201)
})

app.post("/login", sValidator("json", loginSchema), async (c) => {
    const { email, password } = c.req.valid("json")

    const [user] = await db.select().from(UsersTable).where(eq(UsersTable.email, email)).limit(1)
    if (!user) {
        return c.json({ error: "E-mail ou senha inválidos" }, 401)
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
        return c.json({ error: "E-mail ou senha inválidos" }, 401)
    }

    const token = await sign({ sub: user.id, email: user.email }, env.JWT_SECRET)
    return c.json({ token }, 200)
})

// Usado pelo frontend só pra mostrar nome e limite no cabeçalho do chat.
app.get("/me", requireAuth, async (c) => {
    const userId = c.get("userId") as string

    const [user] = await db.select().from(UsersTable).where(eq(UsersTable.id, userId)).limit(1)
    if (!user) {
        return c.json({ error: "Usuário não encontrado" }, 404)
    }

    return c.json({ name: user.name, email: user.email, spendingLimit: user.spendingLimit })
})

export default app