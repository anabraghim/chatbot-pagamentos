import OpenAI from "openai"
import { env } from "../data/env.ts"
import { getMcpClient } from "../mcp/client.ts"

type ChatCompletionMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam
type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool

const openrouter = new OpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
})

const SYSTEM_PROMPT = `Você é o assistente de compras da loja. Responda sempre em português do Brasil.
Use a ferramenta listar_catalogo sempre que o usuário perguntar o que está à venda, preços, categorias ou estoque.
Não invente produtos, preços ou informações que não vieram das ferramentas.`

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
    history: ChatCompletionMessageParam[]
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
            let args: Record<string, unknown> = {}
            try {
                args = JSON.parse(toolCall.function.arguments || "{}")
            } catch {
                args = {}
            }

            const result = await mcpClient.callTool({
                name: toolCall.function.name,
                arguments: args,
            })

            const textPart = Array.isArray(result.content)
                ? result.content.find((c) => c.type === "text")
                : undefined

            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: textPart && "text" in textPart ? String(textPart.text) : JSON.stringify(result),
            })
        }
    }

    return messages.slice(1)
}
