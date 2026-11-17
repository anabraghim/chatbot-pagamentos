import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { db } from "../../../backend/src/db/db.ts"
import { IntentionsTable } from "../../../backend/src/db/schema.ts"
import { USER_ID_META_KEY } from "../../../backend/src/mcp/meta.ts"
import { recusar } from "./recusar.ts"

const INTENTION_TTL_MINUTES = 15

// z.guid() e não z.uuid(): o guard precisa aceitar exatamente o que a coluna uuid do
// Postgres aceita. z.uuid() exige o nibble de versão do RFC 4122 e recusaria ids válidos
// no banco, transformando produto existente em PRODUTO_NAO_ENCONTRADO.
const uuidSchema = z.guid()

export function registerRegistrarIntencao(server: McpServer) {
    server.registerTool(
        "registrar_intencao",
        {
            title: "Registrar intenção de compra",
            description:
                "Registra a intenção de compra de um item do catálogo e devolve um identificador. Nenhum pagamento é feito nesta etapa.",
            inputSchema: {
                produto_id: z.string().describe("Id do produto, exatamente como retornado por listar_catalogo."),
                quantidade: z.number().int().positive().describe("Quantidade desejada, inteiro maior que zero."),
            },
            outputSchema: {
                intencao_id: z.string(),
                produto_id: z.string(),
                quantidade: z.number(),
                valor_total: z.number(),
                moeda: z.string(),
                status: z.string(),
                expira_em: z.string(),
            },
        },
        async ({ produto_id, quantidade }, extra) => {
            // A identidade é injetada pelo backend no _meta. Ausência = chamada fora do fluxo do usuário.
            const userId = extra._meta?.[USER_ID_META_KEY]

            if (typeof userId !== "string") {
                return recusar(
                    "INTENCAO_INVALIDA",
                    "Não foi possível identificar o usuário da sessão. A intenção não pode ser registrada."
                )
            }

            // Valida o formato antes de ir ao banco: um id inventado pelo modelo (ex.: "prod_003")
            // faria o Postgres lançar erro de sintaxe de uuid e vazar erro cru para o agente.
            if (!uuidSchema.safeParse(produto_id).success) {
                return recusar(
                    "PRODUTO_NAO_ENCONTRADO",
                    `Não existe nenhum produto com o id "${produto_id}". Consulte o catálogo e use um id retornado por listar_catalogo.`
                )
            }

            const product = await db.query.ProductsTable.findFirst({ where: { id: produto_id } })

            if (product == null) {
                return recusar(
                    "PRODUTO_NAO_ENCONTRADO",
                    `Não existe nenhum produto com o id "${produto_id}". Consulte o catálogo e use um id retornado por listar_catalogo.`
                )
            }

            if (quantidade > product.stock) {
                return recusar(
                    "ESTOQUE_INSUFICIENTE",
                    `Estoque insuficiente para "${product.name}": foram pedidas ${quantidade} unidades e há apenas ${product.stock} disponíveis.`
                )
            }

            // Valor calculado aqui, no servidor: o preço nunca vem do cliente nem do modelo.
            const totalAmount = product.price * quantidade
            const expiresAt = new Date(Date.now() + INTENTION_TTL_MINUTES * 60_000)

            const [intention] = await db
                .insert(IntentionsTable)
                .values({
                    userId,
                    productId: product.id,
                    quantity: quantidade,
                    unitPrice: product.price,
                    totalAmount,
                    currency: product.currency,
                    expiresAt,
                })
                .returning()

            const payload = {
                intencao_id: intention.id,
                produto_id: intention.productId,
                quantidade: intention.quantity,
                valor_total: intention.totalAmount,
                moeda: intention.currency,
                status: intention.status,
                expira_em: intention.expiresAt.toISOString(),
            }

            return {
                content: [{ type: "text" as const, text: JSON.stringify(payload) }],
                structuredContent: payload,
            }
        }
    )
}
