import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { registerListarCatalogo } from "./tools/listar-catalogo.ts"
import { registerRealizarCompra } from "./tools/realizar-compra.ts"
import { registerRegistrarIntencao } from "./tools/registrar-intencao.ts"

const server = new McpServer({
    name: "payment-agent-catalog",
    version: "0.1.0",
})

registerListarCatalogo(server)
registerRegistrarIntencao(server)
registerRealizarCompra(server)

const transport = new StdioServerTransport()
await server.connect(transport)

console.error("[mcp-server] listar_catalogo, registrar_intencao, realizar_compra prontos (stdio)")
