import { db } from "./db.ts"
import { env } from "../data/env.ts"
import { ProductsTable, UsersTable } from "./schema.ts"

// Cria o usuário demo usado enquanto não existe autenticação.
// A FK intentions.userId -> users.id exige que ele exista antes de registrar qualquer intenção.
await db
    .insert(UsersTable)
    .values({
        id: env.DEMO_USER_ID,
        name: "Usuário Demo",
        email: "demo@local",
        spendingLimit: 5000
    })
    .onConflictDoNothing()

// Catálogo mínimo para o chat ter o que vender. Ids fixos deixam o seed idempotente.
await db
    .insert(ProductsTable)
    .values([
        {
            id: "10000000-0000-0000-0000-000000000001",
            name: "Fone Bluetooth",
            price: 249.9,
            currency: "BRL",
            stock: 12,
            category: "audio"
        },
        {
            id: "10000000-0000-0000-0000-000000000002",
            name: "Teclado Mecânico",
            price: 459.0,
            currency: "BRL",
            stock: 5,
            category: "perifericos"
        },
        {
            id: "10000000-0000-0000-0000-000000000003",
            name: "Mouse Sem Fio",
            price: 129.5,
            currency: "BRL",
            stock: 30,
            category: "perifericos"
        }
    ])
    .onConflictDoNothing()

console.log(`✅ Usuário demo pronto: ${env.DEMO_USER_ID}`)
console.log("✅ Catálogo semeado com 3 produtos")

process.exit(0)
