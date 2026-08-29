import { pgTable, uuid, text, numeric, integer, timestamp } from "drizzle-orm/pg-core"
import { ProductsTable } from "./products.ts"
import { UsersTable } from "./users.ts"

export const IntentionsTable = pgTable("intentions", {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().notNull().references(() => UsersTable.id),
    productId: uuid().notNull().references(() => ProductsTable.id),
    quantity: integer().notNull(),
    unitPrice: numeric({ precision: 10, scale: 2, mode: "number" }).notNull(),
    totalAmount: numeric({ precision: 10, scale: 2, mode: "number" }).notNull(),
    currency: text().notNull(),
    status: text().notNull().default("pendente"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
})
