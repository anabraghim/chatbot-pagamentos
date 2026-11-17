import { randomUUID } from "node:crypto"
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb"
import { ddb, tableName } from "./shared/db"
import { FALHA_GENERICA, recusar, reais } from "./shared/respostas"

const INTENTION_TTL_MINUTES = 15

interface Evento {
    usuario_id?: string // injetado pelo agente a partir do login (nunca vem do modelo)
    produto_id?: string
    quantidade?: number
}

// Contrato (igual à Fase 1):
//   entrada: { produto_id, quantidade }
//   saída:   { intencao_id, produto_id, quantidade, valor_total, moeda, status, expira_em }
//   erros:   PRODUTO_NAO_ENCONTRADO, ESTOQUE_INSUFICIENTE (+ INTENCAO_INVALIDA se não há usuário)
export const handler = async (event: Evento) => {
    try {
        const { usuario_id: userId, produto_id: produtoId, quantidade } = event

        if (typeof userId !== "string" || userId.length === 0) {
            return recusar(
                "INTENCAO_INVALIDA",
                "Não foi possível identificar o usuário da sessão. A intenção não pode ser registrada."
            )
        }

        if (typeof quantidade !== "number" || !Number.isInteger(quantidade) || quantidade <= 0) {
            return recusar("ARGUMENTO_INVALIDO", "A quantidade precisa ser um número inteiro maior que zero.")
        }

        const naoEncontrado = recusar(
            "PRODUTO_NAO_ENCONTRADO",
            `Não existe nenhum produto com o id "${produtoId}". Consulte o catálogo e use um id retornado por listar_catalogo.`
        )

        if (typeof produtoId !== "string" || produtoId.length === 0 || produtoId.length > 100) {
            return naoEncontrado
        }

        const product = (
            await ddb.send(new GetCommand({ TableName: tableName("PRODUCTS_TABLE"), Key: { productId: produtoId } }))
        ).Item

        if (!product) return naoEncontrado

        if (quantidade > (product.stock as number)) {
            return recusar(
                "ESTOQUE_INSUFICIENTE",
                `Estoque insuficiente para "${product.name}": foram pedidas ${quantidade} unidades e há apenas ${product.stock} disponíveis.`
            )
        }

        // Valor calculado aqui, no servidor: o preço nunca vem do cliente nem do modelo.
        const unitPriceCents = product.priceCents as number
        const totalCents = unitPriceCents * quantidade
        const expiresAtMs = Date.now() + INTENTION_TTL_MINUTES * 60_000
        const intentionId = randomUUID()

        await ddb.send(
            new PutCommand({
                TableName: tableName("INTENTIONS_TABLE"),
                Item: {
                    intentionId,
                    userId,
                    productId: product.productId,
                    quantity: quantidade,
                    unitPriceCents,
                    totalCents,
                    currency: product.currency,
                    status: "pendente",
                    expiresAt: expiresAtMs,
                    createdAt: new Date().toISOString(),
                },
                ConditionExpression: "attribute_not_exists(intentionId)",
            })
        )

        return {
            intencao_id: intentionId,
            produto_id: product.productId,
            quantidade,
            valor_total: reais(totalCents),
            moeda: product.currency,
            status: "pendente",
            expira_em: new Date(expiresAtMs).toISOString(),
        }
    } catch (error) {
        console.error("registrar_intencao falhou", error)
        return FALHA_GENERICA
    }
}
