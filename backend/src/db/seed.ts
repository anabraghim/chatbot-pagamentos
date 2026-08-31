import bcrypt from "bcryptjs"
import { db } from "./db.ts"
import { ProductsTable, UsersTable } from "./schema.ts"

// Cria o usuário demo com uma senha conhecida, pra dar pra testar o login
// pronto sem precisar cadastrar ninguém antes.
// Login: demo@local   Senha: demo1234
//
// Id fixo, como os dos produtos abaixo: é fixture de seed, não configuração.
// A identidade do chat vem do JWT (ver src/routes/chat.ts), não daqui.
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"

const demoPasswordHash = await bcrypt.hash("demo1234", 10)

await db
    .insert(UsersTable)
    .values({
        id: DEMO_USER_ID,
        name: "Usuário Demo",
        email: "demo@local",
        passwordHash: demoPasswordHash,
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

console.log(`✅ Usuário demo pronto: ${DEMO_USER_ID} (login: demo@local / demo1234)`)
console.log("✅ Catálogo semeado com 3 produtos")

process.exit(0)
