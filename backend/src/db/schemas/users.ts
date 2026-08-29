import { pgTable, uuid, text, numeric } from "drizzle-orm/pg-core"

export const UsersTable = pgTable("users", {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    email: text().notNull().unique(),
    spendingLimit: numeric({ precision: 10, scale: 2, mode: "number" }).notNull()
})
