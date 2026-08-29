import { Hono } from "hono"
import { sValidator } from "@hono/standard-validator"
import { z } from "zod"
import { runAgentLoop } from "../services/agent.ts"
import { env } from "../data/env.ts"

const messageSchema = z.object({
    role: z.enum(["user", "assistant", "tool"]),
    content: z.string().nullable().optional(),
    tool_calls: z.array(z.any()).optional(),
    tool_call_id: z.string().optional(),
    name: z.string().optional(),
})

const chatRequestSchema = z.object({
    messages: z.array(messageSchema).min(1),
})

const app = new Hono()

app.post("/", sValidator("json", chatRequestSchema), async (c) => {
    const { messages } = c.req.valid("json")

    // ! TROCAR POR c.get("userId") QUANDO O MIDDLEWARE DE AUTENTICAÇÃO ENTRAR
    const userId = env.DEMO_USER_ID

    const updated = await runAgentLoop(messages as any, userId)
    return c.json({ messages: updated })
})

export default app
