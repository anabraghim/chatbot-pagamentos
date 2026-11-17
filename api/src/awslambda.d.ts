// `awslambda` é um objeto global fornecido pelo runtime Node.js do Lambda (streaming de resposta).
import type { Writable } from "node:stream"
import type { APIGatewayProxyEvent, Context } from "aws-lambda"

declare global {
    namespace awslambda {
        function streamifyResponse(
            handler: (event: APIGatewayProxyEvent, responseStream: Writable, context: Context) => Promise<void>
        ): unknown
        const HttpResponseStream: {
            from(
                stream: Writable,
                metadata: { statusCode: number; headers?: Record<string, string> }
            ): Writable
        }
    }
}
export {}
