import { Hono } from "hono"
import { db } from "../db/db.ts"

const app = new Hono()

app.get('/', async (c) => {
    const products = await db.query.ProductsTable.findMany()
    return c.json(products)
})

app.get("/:id", async (c) => {
    const id = c.req.param("id")

    const product = await db.query.ProductsTable.findFirst({where: {id}})

    if (product == null) {
        return c.json({ error: "Product not found"}, 404)
    }
    
    return c.json(product)
})

// ! FAZER A ROTA POST PARA CRIAR UM PRODUTO

export default app