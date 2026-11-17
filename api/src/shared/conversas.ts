import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb"

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const TABLE = () => process.env.CONVERSATIONS_TABLE!
const CONVERSATION_ID = "default" // uma conversa contínua por usuário
const MAX_JSON_CHARS = 300_000 // item do DynamoDB aceita até 400 KB

// Mensagens no formato do Strands/Bedrock Converse:
// { role: "user"|"assistant", content: [{ text } | { toolUse } | { toolResult }] }
export type Mensagem = { role: "user" | "assistant"; content: Array<Record<string, any>> }

export async function carregarHistorico(userId: string): Promise<Mensagem[]> {
    const res = await ddb.send(
        new GetCommand({ TableName: TABLE(), Key: { userId, conversationId: CONVERSATION_ID }, ConsistentRead: true })
    )
    if (!res.Item?.messagesJson) return []
    try {
        return JSON.parse(res.Item.messagesJson as string) as Mensagem[]
    } catch {
        return []
    }
}

// Mensagem de usuário "de verdade" (texto), e não um toolResult devolvido ao modelo.
const ehTurnoDoUsuario = (m: Mensagem) => m.role === "user" && m.content.some((b) => "text" in b)

export async function salvarHistorico(userId: string, mensagens: Mensagem[]): Promise<void> {
    let lista = mensagens
    // Se a conversa ficar grande demais, descarta turnos antigos começando sempre em uma fala do usuário.
    while (JSON.stringify(lista).length > MAX_JSON_CHARS && lista.length > 2) {
        const proximo = lista.findIndex((m, i) => i > 0 && ehTurnoDoUsuario(m))
        if (proximo === -1) break
        lista = lista.slice(proximo)
    }
    await ddb.send(
        new PutCommand({
            TableName: TABLE(),
            Item: {
                userId,
                conversationId: CONVERSATION_ID,
                messagesJson: JSON.stringify(lista),
                updatedAt: new Date().toISOString(),
            },
        })
    )
}

// Versão para a tela: só o texto de usuário/assistente, sem chamadas de ferramenta.
export function paraTela(mensagens: Mensagem[]): Array<{ role: "user" | "assistant"; content: string }> {
    return mensagens
        .map((m) => ({
            role: m.role,
            content: m.content
                .filter((b) => typeof b.text === "string")
                .map((b) => b.text as string)
                .join("\n")
                .trim(),
        }))
        .filter((m) => m.content.length > 0)
}
