import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import productRoutes from  './routes/product.ts'
import chatRoutes from './routes/chat.ts'
import authRoutes from './routes/auth.ts'
import { env } from './data/env.ts'
import { getMcpClient } from './mcp/client.ts'

const app = new Hono()

app.use('*', cors({ origin: 'http://localhost:5173' }))

app.route("/products", productRoutes)
app.route("/chat", chatRoutes)
app.route("/auth", authRoutes)

await getMcpClient()

serve({
  fetch: app.fetch,
  port: env.PORT,
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
