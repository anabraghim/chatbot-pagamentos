import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore"
import type { Readable } from "node:stream"
import { carregarHistorico, salvarHistorico, type Mensagem } from "./shared/conversas"

const agentcore = new BedrockAgentCoreClient({})
const MAX_MESSAGE_CHARS = 4000

const FRIENDLY_ERROR = "Não consegui processar sua mensagem agora. Tente novamente em instantes."

// POST /chat — resposta em streaming (Server-Sent Events).
// Fluxo: valida identidade -> carrega histórico (DynamoDB) -> chama o agente (AgentCore Runtime)
//        -> repassa o texto ao navegador conforme chega -> grava o histórico atualizado.
export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
    const baseHeaders = { "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN!, Vary: "Origin" }

    const responderJson = (statusCode: number, body: unknown) => {
        const out = awslambda.HttpResponseStream.from(responseStream, {
            statusCode,
            headers: { ...baseHeaders, "Content-Type": "application/json" },
        })
        out.write(JSON.stringify(body))
        out.end()
    }

    // usuario_id = `sub` do Cognito, vindo do contexto do autorizador (token validado pelo API Gateway).
    // Nunca lemos identidade do corpo da requisição.
    const userId = event.requestContext.authorizer?.sub as string | undefined
    if (!userId) return responderJson(401, { error: "Não autenticado." })

    let message = ""
    try {
        const body = JSON.parse(event.body ?? "{}")
        message = typeof body.message === "string" ? body.message.trim() : ""
    } catch {
        return responderJson(400, { error: "Corpo da requisição inválido." })
    }
    if (!message) return responderJson(400, { error: "Envie uma mensagem." })
    if (message.length > MAX_MESSAGE_CHARS) return responderJson(400, { error: "Mensagem muito longa." })

    const out = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers: { ...baseHeaders, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
    })
    const enviar = (evento: Record<string, unknown>) => out.write(`data: ${JSON.stringify(evento)}\n\n`)

    try {
        const history = await carregarHistorico(userId)

        const resposta = await agentcore.send(
            new InvokeAgentRuntimeCommand({
                agentRuntimeArn: process.env.AGENT_RUNTIME_ARN!,
                runtimeSessionId: `chat-${userId}`, // mínimo de 33 caracteres; o sub (36) + prefixo cumpre
                payload: new TextEncoder().encode(JSON.stringify({ usuario_id: userId, prompt: message, history })),
            })
        )

        let mensagensFinais: Mensagem[] | null = null
        let houveErro = false

        // O agente emite linhas "data: {json}". Repassamos texto/ferramentas e guardamos o evento "final".
        const decoder = new TextDecoder()
        let buffer = ""

        const tratarLinha = (linha: string) => {
            if (!linha.startsWith("data:")) return
            let dado: unknown = linha.slice(5).trim()
            // tolera JSON duplamente codificado
            for (let i = 0; i < 2 && typeof dado === "string"; i++) {
                try {
                    dado = JSON.parse(dado)
                } catch {
                    return
                }
            }
            if (!dado || typeof dado !== "object") return
            const ev = dado as { type?: string; data?: string; name?: string; message?: string; messages?: Mensagem[] }

            if (ev.type === "text" && ev.data) enviar({ type: "text", data: ev.data })
            else if (ev.type === "tool" && ev.name) enviar({ type: "tool", name: ev.name })
            else if (ev.type === "error") {
                houveErro = true
                enviar({ type: "error", message: ev.message ?? FRIENDLY_ERROR })
            } else if (ev.type === "final" && Array.isArray(ev.messages)) mensagensFinais = ev.messages
        }

        for await (const chunk of resposta.response as unknown as Readable) {
            buffer += decoder.decode(chunk as Uint8Array, { stream: true })
            const linhas = buffer.split("\n")
            buffer = linhas.pop() ?? ""
            linhas.forEach(tratarLinha)
        }
        buffer += decoder.decode()
        if (buffer) tratarLinha(buffer)

        if (mensagensFinais) await salvarHistorico(userId, mensagensFinais)
        else if (!houveErro) enviar({ type: "error", message: FRIENDLY_ERROR })

        enviar({ type: "done" })
    } catch (error) {
        // Detalhes técnicos ficam só no CloudWatch; o usuário recebe uma mensagem compreensível.
        console.error("POST /chat falhou", error)
        enviar({ type: "error", message: FRIENDLY_ERROR })
        enviar({ type: "done" })
    } finally {
        out.end()
    }
})
