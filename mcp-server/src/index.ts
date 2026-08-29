import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { db } from "../../backend/src/db/db.ts"

const server = new McpServer({
    name: "payment-agent-catalog",
    version: "0.1.0",
})

server.registerTool(
    "listar_catalogo",
    {
        title: "Listar catálogo",
        description: "Retorna os produtos disponíveis no catálogo, com filtro opcional por categoria.",
        inputSchema: {
            categoria: z.string().optional().describe("Filtro opcional por categoria de produto."),
        },
        outputSchema: {
            produtos: z.array(
                z.object({
                    id: z.string(),
                    nome: z.string(),
                    preco: z.number(),
                    moeda: z.string(),
                    estoque: z.number(),
                })
            ),
        },
    },
    async ({ categoria }) => {
        const rows = await db.query.ProductsTable.findMany({
            where: categoria ? { category: categoria } : undefined,
        })

        const produtos = rows.map((p) => ({
            id: p.id,
            nome: p.name,
            preco: p.price,
            moeda: p.currency,
            estoque: p.stock,
        }))

        return {
            content: [{ type: "text" as const, text: JSON.stringify({ produtos }) }],
            structuredContent: { produtos },
        }
    }
)

const transport = new StdioServerTransport()
await server.connect(transport)

console.error("[mcp-server] listar_catalogo pronto (stdio)")
