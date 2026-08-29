import path from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(__dirname, "../..")
const mcpServerEntry = path.resolve(backendRoot, "../mcp-server/src/index.ts")

let clientPromise: Promise<Client> | null = null

async function createClient(): Promise<Client> {
    const transport = new StdioClientTransport({
        command: "npx",
        args: ["tsx", mcpServerEntry],
        cwd: backendRoot,
        env: process.env as Record<string, string>,
        stderr: "inherit",
    })

    const client = new Client({ name: "payment-agent-backend", version: "0.1.0" })
    await client.connect(transport)
    return client
}

export function getMcpClient(): Promise<Client> {
    if (!clientPromise) {
        clientPromise = createClient()
    }
    return clientPromise
}
