import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda"
import { carregarHistorico, paraTela } from "./shared/conversas"

// GET /conversas — devolve o histórico do usuário autenticado.
// O usuário vem do contexto do autorizador (token já validado), nunca da query/body.
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN!,
        Vary: "Origin",
    }

    const userId = event.requestContext.authorizer?.sub as string | undefined
    if (!userId) return { statusCode: 401, headers, body: JSON.stringify({ error: "Não autenticado." }) }

    try {
        const mensagens = await carregarHistorico(userId)
        return { statusCode: 200, headers, body: JSON.stringify({ messages: paraTela(mensagens) }) }
    } catch (error) {
        console.error("GET /conversas falhou", error)
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Não foi possível carregar a conversa." }) }
    }
}
