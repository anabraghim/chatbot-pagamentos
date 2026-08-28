import "dotenv/config"
import { Client } from "pg"

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

try {
  await client.connect()

  console.log("✅ CONECTOU NO BANCO!")

  await client.end()
} catch (error) {
  console.error("❌ ERRO AO CONECTAR:", error)
}