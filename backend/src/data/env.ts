import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
    PORT: z.coerce.number().int().positive().default(3000),
    DB_PASSWORD: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_NAME: z.string().min(1),
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive(),
    //JWT_SECRET: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
    OPENROUTER_MODEL: z.string().min(1).default("minimax/minimax-m3:free"),
    // Usuário fixo usado enquanto não existe autenticação. Ver src/db/seed.ts
    DEMO_USER_ID: z.uuid().default("00000000-0000-0000-0000-000000000001"),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`)
}

export const env = parsed.data