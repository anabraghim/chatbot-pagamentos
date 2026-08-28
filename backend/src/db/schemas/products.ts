import { pgTable, uuid, text, numeric, integer } from "drizzle-orm/pg-core"

export const ProductsTable = pgTable("products", {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    price: numeric({ precision: 10, scale: 2 }).notNull(),
    currency: text().notNull(),
    stock: integer().notNull(),
    category: text().notNull()
})