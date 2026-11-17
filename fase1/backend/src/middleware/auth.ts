import { createMiddleware } from "hono/factory"
import { jwt } from "hono/jwt"
import { env } from "../data/env.ts"

// Tipo compartilhado por todo lugar que usa c.get("userId")/c.set("userId", ...)
// — sem isso, o TypeScript não sabe que essa variável existe no contexto.
export type AuthEnv = {
    Variables: {
        userId: string
        jwtPayload: { sub: string; email: string }
    }
}

// Protege uma rota exigindo um JWT válido no header:
//   Authorization: Bearer <token>
//
// Em caso de sucesso, deixa o id do usuário disponível para o handler
// via c.get("userId") — é daí que chat.ts tira a identidade da requisição.
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
    const verify = jwt({ secret: env.JWT_SECRET, alg: "HS256" })
    return verify(c, async () => {
        const payload = c.get("jwtPayload") as { sub: string; email: string }
        c.set("userId", payload.sub)
        await next()
    })
})