import { sValidator } from "@hono/standard-validator"
import { Hono } from "hono"
import { db } from "../db/db.ts"
import z from "zod"
import { ProductsTable } from "../db/schema.ts"

const app = new Hono()

const createProductSchema = z.object({
    name: z.string().min(1),
    price: z.number(),
    currency: z.string(),
    stock: z.number(),
    category: z.string()
})

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


app.post("/" , sValidator("json", createProductSchema) , async c => {
    const data = c.req.valid("json")

    const [product] = await db.insert(ProductsTable).values(data).returning()

    return c.json(product, 201)
})

// ! FAZER A ROTA PUT PARA ATUALIZAR O ESTOQUE O PRODUTO

export default app