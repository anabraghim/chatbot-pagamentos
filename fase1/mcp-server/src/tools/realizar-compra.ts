import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { USER_ID_META_KEY } from "../../../backend/src/mcp/meta.ts"
import { executePurchase } from "../../../backend/src/services/purchase.ts"
import { recusar } from "./recusar.ts"

// z.guid() e não z.uuid(), mesmo motivo de registrar-intencao.ts: o guard precisa aceitar
// exatamente o que a coluna uuid do Postgres aceita, e z.uuid() exige o nibble de versão
// do RFC 4122.
const uuidSchema = z.guid()

export function registerRealizarCompra(server: McpServer) {
    server.registerTool(
        "realizar_compra",
        {
            title: "Realizar compra",
            description:
                "Executa o pagamento de uma intenção de compra previamente registrada. O valor vem da intenção, não é informado aqui.",
            inputSchema: {
                intencao_id: z
                    .string()
                    .describe("Identificador devolvido por registrar_intencao nesta conversa."),
                // string e não enum: um enum faria o SDK recusar antes do handler e o erro
                // METODO_INVALIDO nunca voltaria no formato padrão de recusa.
                metodo_pagamento: z
                    .string()
                    .describe('Método de pagamento escolhido pelo usuário: "cartao" ou "pix".'),
            },
            outputSchema: {
                status: z.string(),
                transacao_id: z.string(),
                intencao_id: z.string(),
                valor: z.number(),
                metodo_pagamento: z.string(),
                limite_restante: z.number(),
                data: z.string(),
            },
        },
        async ({ intencao_id, metodo_pagamento }, extra) => {
            // A identidade é injetada pelo backend no _meta. Ausência = chamada fora do fluxo do usuário.
            const userId = extra._meta?.[USER_ID_META_KEY]

            if (typeof userId !== "string") {
                return recusar(
                    "INTENCAO_INVALIDA",
                    "Não foi possível identificar o usuário da sessão. A compra não pode ser concluída."
                )
            }

            // Valida o formato antes de ir ao banco: um id inventado pelo modelo (ex.: "int_a1b2c3")
            // faria o Postgres lançar erro de sintaxe de uuid e vazar erro cru para o agente.
            if (!uuidSchema.safeParse(intencao_id).success) {
                return recusar(
                    "INTENCAO_INVALIDA",
                    `Não existe nenhuma intenção de compra com o id "${intencao_id}". Registre a intenção com registrar_intencao antes de pagar.`
                )
            }

            const result = await executePurchase({
                intentionId: intencao_id,
                userId,
                paymentMethod: metodo_pagamento,
            })

            if (!result.ok) {
                return recusar(result.erro, result.mensagem)
            }

            const payload = {
                status: "aprovado",
                transacao_id: result.transactionId,
                intencao_id: result.intentionId,
                valor: result.amount,
                metodo_pagamento: result.paymentMethod,
                limite_restante: result.remainingLimit,
                data: result.createdAt.toISOString(),
            }

            return {
                content: [{ type: "text" as const, text: JSON.stringify(payload) }],
                structuredContent: payload,
            }
        }
    )
}
