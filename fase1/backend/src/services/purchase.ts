import { and, eq, sql, sum } from "drizzle-orm"
import { db } from "../db/db.ts"
import { IntentionsTable, ProductsTable, TransactionsTable, UsersTable } from "../db/schema.ts"

// A regra de negócio da compra mora aqui, e não na tool do mcp-server, por dois motivos:
//
// 1. O backend é a fonte da verdade. O valor nunca vem do argumento da tool: é lido da
//    intenção gravada no banco, então o modelo não consegue inventar nem alterar preço.
// 2. `mcp-server/node_modules` não tem `drizzle-orm` (não existe node_modules na raiz).
//    As tools só conseguem importar `db` e as tabelas porque esses arquivos moram dentro
//    de `backend/src` e resolvem a dependência a partir de `backend/node_modules`. Um
//    `import { eq } from "drizzle-orm"` dentro de `mcp-server/src/` quebraria em runtime
//    com ERR_MODULE_NOT_FOUND. A tool é um adaptador fino sobre este serviço.

export const PAYMENT_METHODS = ["cartao", "pix"] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export type PurchaseResult =
    | {
          ok: true
          transactionId: string
          intentionId: string
          amount: number
          currency: string
          paymentMethod: PaymentMethod
          remainingLimit: number
          createdAt: Date
      }
    | { ok: false; erro: string; mensagem: string }

function recusa(erro: string, mensagem: string): PurchaseResult {
    return { ok: false, erro, mensagem }
}

// Colunas numeric(10,2) chegam como number, então a aritmética é de ponto flutuante.
// Arredondar o que sai daqui evita mandar 4750.000000000001 para o modelo.
function money(value: number) {
    return Math.round(value * 100) / 100
}

export async function executePurchase(input: {
    intentionId: string
    userId: string
    paymentMethod: string
}): Promise<PurchaseResult> {
    const { intentionId, userId, paymentMethod } = input

    // Validado aqui e não no schema da tool: um z.enum faria o SDK do MCP recusar antes
    // do handler, e METODO_INVALIDO nunca voltaria no formato padrão de recusa.
    if (!PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
        return recusa(
            "METODO_INVALIDO",
            `"${paymentMethod}" não é um método de pagamento aceito. Os métodos disponíveis são cartao e pix.`
        )
    }

    const method = paymentMethod as PaymentMethod

    return db.transaction(async (tx) => {
        // O userId entra no where junto com o id: uma intenção de outro usuário é
        // indistinguível de uma inexistente, e as duas viram INTENCAO_INVALIDA.
        const intention = await tx.query.IntentionsTable.findFirst({
            where: { id: intentionId, userId },
        })

        if (intention == null) {
            return recusa(
                "INTENCAO_INVALIDA",
                `Não existe nenhuma intenção de compra com o id "${intentionId}" para este usuário. Registre a intenção com registrar_intencao antes de pagar.`
            )
        }

        if (intention.status !== "pendente") {
            return recusa(
                "INTENCAO_JA_PAGA",
                "Essa intenção de compra já foi paga. Registre uma nova intenção se quiser comprar de novo."
            )
        }

        if (intention.expiresAt.getTime() <= Date.now()) {
            return recusa(
                "INTENCAO_EXPIRADA",
                "Essa intenção de compra expirou. Registre uma nova intenção para seguir com a compra."
            )
        }

        const user = await tx.query.UsersTable.findFirst({ where: { id: userId } })

        if (user == null) {
            return recusa(
                "INTENCAO_INVALIDA",
                "Não foi possível identificar o usuário da sessão. A compra não pode ser concluída."
            )
        }

        // limite_restante é derivado, não guardado: spendingLimit menos a soma do que já
        // foi aprovado. Assim não há coluna de gasto para dessincronizar do histórico.
        const [spentRow] = await tx
            .select({ spent: sum(TransactionsTable.amount) })
            .from(TransactionsTable)
            .where(and(eq(TransactionsTable.userId, userId), eq(TransactionsTable.status, "aprovado")))

        const remaining = money(user.spendingLimit - Number(spentRow?.spent ?? 0))

        if (intention.totalAmount > remaining) {
            return recusa(
                "LIMITE_EXCEDIDO",
                `A compra de ${intention.currency} ${intention.totalAmount.toFixed(2)} ultrapassa o limite disponível do usuário, que é de ${intention.currency} ${remaining.toFixed(2)}.`
            )
        }

        // O estoque pode ter mudado entre registrar a intenção e pagar.
        const product = await tx.query.ProductsTable.findFirst({ where: { id: intention.productId } })

        if (product == null) {
            return recusa(
                "INTENCAO_INVALIDA",
                "O produto dessa intenção não está mais disponível no catálogo. Registre uma nova intenção."
            )
        }

        if (product.stock < intention.quantity) {
            return recusa(
                "ESTOQUE_INSUFICIENTE",
                `O estoque de "${product.name}" mudou desde o registro da intenção: restam ${product.stock} unidades e a intenção pede ${intention.quantity}. Registre uma nova intenção com uma quantidade menor.`
            )
        }

        // Daqui para baixo é escrita. O `where` com status = 'pendente' é o que fecha a
        // corrida entre duas chamadas simultâneas: só uma delas atualiza a linha.
        const paid = await tx
            .update(IntentionsTable)
            .set({ status: "paga" })
            .where(and(eq(IntentionsTable.id, intention.id), eq(IntentionsTable.status, "pendente")))
            .returning()

        if (paid.length === 0) {
            return recusa(
                "INTENCAO_JA_PAGA",
                "Essa intenção de compra já foi paga. Registre uma nova intenção se quiser comprar de novo."
            )
        }

        await tx
            .update(ProductsTable)
            .set({ stock: sql`${ProductsTable.stock} - ${intention.quantity}` })
            .where(eq(ProductsTable.id, product.id))

        const [transaction] = await tx
            .insert(TransactionsTable)
            .values({
                intentionId: intention.id,
                userId,
                amount: intention.totalAmount,
                currency: intention.currency,
                paymentMethod: method,
            })
            .returning()

        return {
            ok: true,
            transactionId: transaction.id,
            intentionId: intention.id,
            amount: intention.totalAmount,
            currency: intention.currency,
            paymentMethod: method,
            remainingLimit: money(remaining - intention.totalAmount),
            createdAt: transaction.createdAt,
        }
    })
}
