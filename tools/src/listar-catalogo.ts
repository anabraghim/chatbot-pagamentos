import { ScanCommand } from "@aws-sdk/lib-dynamodb"
import { ddb, tableName } from "./shared/db"
import { FALHA_GENERICA, reais } from "./shared/respostas"

interface Evento {
    usuario_id?: string
    categoria?: string
}

// Contrato (igual à Fase 1):
//   entrada:  { categoria?: string }
//   saída:    { produtos: [{ id, nome, preco, moeda, estoque }] }
export const handler = async (event: Evento) => {
    try {
        const produtos: Array<Record<string, unknown>> = []
        let lastKey: Record<string, unknown> | undefined

        // Catálogo pequeno: Scan com paginação é suficiente (ver README, seção de modelagem).
        do {
            const res = await ddb.send(
                new ScanCommand({
                    TableName: tableName("PRODUCTS_TABLE"),
                    ExclusiveStartKey: lastKey,
                    ...(event.categoria
                        ? {
                              FilterExpression: "#cat = :cat",
                              ExpressionAttributeNames: { "#cat": "category" },
                              ExpressionAttributeValues: { ":cat": event.categoria },
                          }
                        : {}),
                })
            )
            for (const p of res.Items ?? []) {
                produtos.push({
                    id: p.productId,
                    nome: p.name,
                    preco: reais(p.priceCents as number),
                    moeda: p.currency,
                    estoque: p.stock,
                })
            }
            lastKey = res.LastEvaluatedKey
        } while (lastKey)

        produtos.sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
        return { produtos }
    } catch (error) {
        console.error("listar_catalogo falhou", error)
        return FALHA_GENERICA
    }
}
