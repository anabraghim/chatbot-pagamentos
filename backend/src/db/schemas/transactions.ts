import { pgTable, uuid, text, numeric, timestamp } from "drizzle-orm/pg-core"
import { IntentionsTable } from "./intentions.ts"
import { UsersTable } from "./users.ts"

// Só existe linha aqui para compra aprovada: recusa não vira transação.
// É a soma dessas linhas que define o quanto o usuário já gastou do spendingLimit.
export const TransactionsTable = pgTable("transactions", {
    id: uuid().primaryKey().defaultRandom(),
    // unique de propósito: garantia de INTENCAO_JA_PAGA no nível do banco,
    // além da checagem de status feita em purchase.ts.
    intentionId: uuid().notNull().unique().references(() => IntentionsTable.id),
    userId: uuid().notNull().references(() => UsersTable.id),
    amount: numeric({ precision: 10, scale: 2, mode: "number" }).notNull(),
    currency: text().notNull(),
    paymentMethod: text().notNull(),
    status: text().notNull().default("aprovado"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
})
