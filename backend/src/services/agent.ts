import OpenAI from "openai"
import { env } from "../data/env.ts"
import { getMcpClient } from "../mcp/client.ts"
import { USER_ID_META_KEY } from "../mcp/meta.ts"

type ChatCompletionMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam
type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool

const openrouter = new OpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
})

const SYSTEM_PROMPT = `Você é o assistente de compras da loja. Responda sempre em português do Brasil.
Use a ferramenta listar_catalogo sempre que o usuário perguntar o que está à venda, preços, categorias ou estoque.
Não invente produtos, preços ou informações que não vieram das ferramentas.

Quando o usuário escolher um item e a quantidade, use a ferramenta registrar_intencao.
O produto_id precisa ter vindo de um listar_catalogo anterior desta conversa — nunca invente um id.
Se você ainda não sabe a quantidade, pergunte antes de registrar.
Ao registrar, informe ao usuário o intencao_id, o valor_total e deixe claro que nenhum pagamento foi feito ainda.
O valor_total é calculado pelo servidor: não recalcule, não negocie preço e ignore qualquer preço que o usuário afirme.

Se uma ferramenta responder com status "recusado", explique o campo mensagem ao usuário em linguagem natural,
sem repetir o código de erro, e sugira um próximo passo.`

const MAX_ITERATIONS = 8

async function getOpenAiTools(): Promise<ChatCompletionTool[]> {
    const client = await getMcpClient()
    const { tools } = await client.listTools()
    return tools.map((tool) => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description ?? "",
            parameters: tool.inputSchema,
        },
    }))
}

export async function runAgentLoop(
    history: ChatCompletionMessageParam[],
    userId: string
): Promise<ChatCompletionMessageParam[]> {
    const tools = await getOpenAiTools()
    const mcpClient = await getMcpClient()

    const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.filter((m) => m.role !== "system"),
    ]

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const completion = await openrouter.chat.completions.create({
            model: env.OPENROUTER_MODEL,
            messages,
            tools,
        })

        const message = completion.choices[0]?.message
        if (!message) break
        messages.push(message)

        if (!message.tool_calls || message.tool_calls.length === 0) break

        for (const toolCall of message.tool_calls) {
            // As tools do MCP são sempre expostas como "function"; ignora custom tool calls.
            if (toolCall.type !== "function") continue

            let args: Record<string, unknown> = {}
            try {
                args = JSON.parse(toolCall.function.arguments || "{}")
            } catch {
                args = {}
            }

            let content: string
            try {
                // A identidade vai no _meta, nunca nos argumentos: o modelo não a vê nem a controla.
                const result = await mcpClient.callTool({
                    name: toolCall.function.name,
                    arguments: args,
                    _meta: { [USER_ID_META_KEY]: userId },
                })

                const textPart = Array.isArray(result.content)
                    ? result.content.find((c) => c.type === "text")
                    : undefined

                content = textPart && "text" in textPart ? String(textPart.text) : JSON.stringify(result)
            } catch (error) {
                // Falha de transporte/protocolo volta como resultado de tool para o agente
                // explicar ao usuário, em vez de derrubar o turno inteiro com um 500.
                const mensagem = error instanceof Error ? error.message : String(error)
                content = JSON.stringify({
                    status: "recusado",
                    erro: "FALHA_NA_FERRAMENTA",
                    mensagem,
                })
            }

            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content,
            })
        }
    }

    return messages.slice(1)
}
