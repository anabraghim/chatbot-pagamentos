import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import productRoutes from  './routes/product.ts'
import { env } from './data/env.ts'

const app = new Hono()

app.route("/products", productRoutes)

serve({
  fetch: app.fetch,
  port: env.PORT,
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
