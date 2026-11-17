import { randomUUID } from "node:crypto"
import { GetCommand, PutCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb"
import { ddb, tableName } from "./shared/db"
import { FALHA_GENERICA, formatarBRL, recusar, reais } from "./shared/respostas"

const METODOS = ["cartao", "pix"]
const DEFAULT_LIMIT_CENTS = Number(process.env.DEFAULT_LIMIT_CENTS ?? "500000")

interface Evento {
    usuario_id?: string // injetado pelo agente a partir do login (nunca vem do modelo)
    intencao_id?: string
    metodo_pagamento?: string
}

const jaPaga = () =>
    recusar(
        "INTENCAO_JA_PAGA",
        "Essa intenção de compra já foi paga. Registre uma nova intenção se quiser comprar de novo."
    )

// Usuário é criado na primeira compra, com o limite padrão. A chave é o `sub` do Cognito.
async function obterOuCriarUsuario(userId: string) {
    const key = { userId }
    const TableName = tableName("USERS_TABLE")
    const existente = (await ddb.send(new GetCommand({ TableName, Key: key, ConsistentRead: true }))).Item
    if (existente) return existente

    const novo = { userId, availableLimitCents: DEFAULT_LIMIT_CENTS, createdAt: new Date().toISOString() }
    try {
        await ddb.send(new PutCommand({ TableName, Item: novo, ConditionExpression: "attribute_not_exists(userId)" }))
        return novo
    } catch (error) {
        if ((error as Error).name !== "ConditionalCheckFailedException") throw error
        // Outra requisição criou o usuário no mesmo instante: lê de novo.
        return (await ddb.send(new GetCommand({ TableName, Key: key, ConsistentRead: true }))).Item!
    }
}

// Contrato (igual à Fase 1):
//   entrada: { intencao_id, metodo_pagamento }   (o valor NUNCA é argumento: vem da intenção gravada)
//   saída:   { status, transacao_id, intencao_id, valor, metodo_pagamento, limite_restante, data }
//   erros:   INTENCAO_INVALIDA, INTENCAO_EXPIRADA, INTENCAO_JA_PAGA, LIMITE_EXCEDIDO, METODO_INVALIDO
export const handler = async (event: Evento) => {
    try {
        return await executar(event)
    } catch (error) {
        console.error("realizar_compra falhou", error)
        return FALHA_GENERICA
    }
}

async function executar(event: Evento) {
    const { usuario_id: userId, intencao_id: intentionId, metodo_pagamento: metodo } = event

    if (typeof userId !== "string" || userId.length === 0) {
        return recusar(
            "INTENCAO_INVALIDA",
            "Não foi possível identificar o usuário da sessão. A compra não pode ser concluída."
        )
    }

    if (typeof metodo !== "string" || !METODOS.includes(metodo)) {
        return recusar(
            "METODO_INVALIDO",
            `"${metodo}" não é um método de pagamento aceito. Os métodos disponíveis são cartao e pix.`
        )
    }

    const intencaoInvalida = recusar(
        "INTENCAO_INVALIDA",
        `Não existe nenhuma intenção de compra com o id "${intentionId}" para este usuário. Registre a intenção com registrar_intencao antes de pagar.`
    )

    if (typeof intentionId !== "string" || intentionId.length === 0 || intentionId.length > 100) {
        return intencaoInvalida
    }

    const INTENTIONS = tableName("INTENTIONS_TABLE")
    const PRODUCTS = tableName("PRODUCTS_TABLE")
    const USERS = tableName("USERS_TABLE")
    const TRANSACTIONS = tableName("TRANSACTIONS_TABLE")

    const lerIntencao = async () =>
        (await ddb.send(new GetCommand({ TableName: INTENTIONS, Key: { intentionId }, ConsistentRead: true }))).Item

    const intention = await lerIntencao()

    // Intenção de outro usuário é indistinguível de uma inexistente.
    if (!intention || intention.userId !== userId) return intencaoInvalida

    if (intention.status !== "pendente") return jaPaga()

    if ((intention.expiresAt as number) <= Date.now()) {
        return recusar(
            "INTENCAO_EXPIRADA",
            "Essa intenção de compra expirou. Registre uma nova intenção para seguir com a compra."
        )
    }

    const totalCents = intention.totalCents as number
    const quantity = intention.quantity as number
    const user = await obterOuCriarUsuario(userId)

    if (totalCents > (user.availableLimitCents as number)) {
        return recusar(
            "LIMITE_EXCEDIDO",
            `A compra de ${formatarBRL(totalCents)} ultrapassa o limite disponível do usuário, que é de ${formatarBRL(user.availableLimitCents as number)}.`
        )
    }

    const product = (await ddb.send(new GetCommand({ TableName: PRODUCTS, Key: { productId: intention.productId } })))
        .Item

    if (!product) {
        return recusar(
            "INTENCAO_INVALIDA",
            "O produto dessa intenção não está mais disponível no catálogo. Registre uma nova intenção."
        )
    }

    if ((product.stock as number) < quantity) {
        return recusar(
            "ESTOQUE_INSUFICIENTE",
            `O estoque de "${product.name}" mudou desde o registro da intenção: restam ${product.stock} unidades e a intenção pede ${quantity}. Registre uma nova intenção com uma quantidade menor.`
        )
    }

    const transactionId = randomUUID()
    const agora = new Date()

    // As 4 escritas acontecem juntas ou nenhuma acontece. Cada uma tem uma condição que
    // impede duplicidade se a mesma chamada chegar duas vezes (ou em paralelo):
    //   0) intenção: só vira "paga" se ainda estiver "pendente", for do usuário e não tiver expirado
    //   1) usuário: só debita se o limite disponível cobrir o valor
    //   2) produto: só baixa o estoque se houver quantidade suficiente
    //   3) transação: a chave é o intentionId, então só existe UMA transação por intenção
    try {
        await ddb.send(
            new TransactWriteCommand({
                TransactItems: [
                    {
                        Update: {
                            TableName: INTENTIONS,
                            Key: { intentionId },
                            UpdateExpression: "SET #s = :paga, paidAt = :agora, paymentMethod = :metodo",
                            ConditionExpression: "#s = :pendente AND userId = :userId AND expiresAt > :agoraMs",
                            ExpressionAttributeNames: { "#s": "status" },
                            ExpressionAttributeValues: {
                                ":paga": "paga",
                                ":pendente": "pendente",
                                ":userId": userId,
                                ":agora": agora.toISOString(),
                                ":agoraMs": agora.getTime(),
                                ":metodo": metodo,
                            },
                        },
                    },
                    {
                        Update: {
                            TableName: USERS,
                            Key: { userId },
                            UpdateExpression: "SET availableLimitCents = availableLimitCents - :valor",
                            ConditionExpression: "availableLimitCents >= :valor",
                            ExpressionAttributeValues: { ":valor": totalCents },
                        },
                    },
                    {
                        Update: {
                            TableName: PRODUCTS,
                            Key: { productId: intention.productId },
                            UpdateExpression: "SET stock = stock - :q",
                            ConditionExpression: "stock >= :q",
                            ExpressionAttributeValues: { ":q": quantity },
                        },
                    },
                    {
                        Put: {
                            TableName: TRANSACTIONS,
                            Item: {
                                intentionId,
                                transactionId,
                                userId,
                                amountCents: totalCents,
                                currency: intention.currency,
                                paymentMethod: metodo,
                                status: "aprovado",
                                createdAt: agora.toISOString(),
                            },
                            ConditionExpression: "attribute_not_exists(intentionId)",
                        },
                    },
                ],
            })
        )
    } catch (error) {
        const err = error as Error & { CancellationReasons?: Array<{ Code?: string }> }
        if (err.name !== "TransactionCanceledException") throw error

        const falhou = (i: number) => err.CancellationReasons?.[i]?.Code === "ConditionalCheckFailed"

        if (falhou(1)) {
            return recusar("LIMITE_EXCEDIDO", "A compra ultrapassa o limite disponível do usuário.")
        }
        if (falhou(2)) {
            return recusar(
                "ESTOQUE_INSUFICIENTE",
                "O estoque do produto acabou de mudar e não cobre a quantidade da intenção. Registre uma nova intenção com uma quantidade menor."
            )
        }
        if (falhou(0) || falhou(3)) {
            // Descobre se foi duplicidade (já paga) ou expiração entre a leitura e a escrita.
            const atual = await lerIntencao()
            if (atual && atual.status === "pendente") {
                return recusar(
                    "INTENCAO_EXPIRADA",
                    "Essa intenção de compra expirou. Registre uma nova intenção para seguir com a compra."
                )
            }
            return jaPaga()
        }
        throw error
    }

    const usuarioDepois = (await ddb.send(new GetCommand({ TableName: USERS, Key: { userId }, ConsistentRead: true })))
        .Item

    return {
        status: "aprovado",
        transacao_id: transactionId,
        intencao_id: intentionId,
        valor: reais(totalCents),
        metodo_pagamento: metodo,
        limite_restante: reais((usuarioDepois?.availableLimitCents as number) ?? 0),
        data: agora.toISOString(),
    }
}
