import { CognitoJwtVerifier } from "aws-jwt-verify"
import type { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from "aws-lambda"

// Autorizador do API Gateway: valida o JWT do Cognito (assinatura, expiração, emissor e client).
// Token ausente/mal formado -> o próprio API Gateway responde 401 (validationRegex), sem chegar aqui.
// Token inválido/expirado   -> lançamos Error("Unauthorized"), que o API Gateway converte em 401.
// Só se o token for válido a requisição segue para a Lambda do chat.
const verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.USER_POOL_ID!,
    clientId: process.env.USER_POOL_CLIENT_ID!,
    tokenUse: "id",
})

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
    const token = event.authorizationToken?.replace(/^Bearer\s+/i, "")

    try {
        const claims = await verifier.verify(token)

        // methodArn = arn:aws:execute-api:REGIAO:CONTA:API/STAGE/METODO/RECURSO -> libera só esta API/stage
        const [apiArn, stage] = event.methodArn.split("/")
        return {
            principalId: claims.sub,
            policyDocument: {
                Version: "2012-10-17",
                Statement: [{ Action: "execute-api:Invoke", Effect: "Allow", Resource: `${apiArn}/${stage}/*/*` }],
            },
            // O sub vem de um token já validado. É daqui que a Lambda do chat tira o usuario_id.
            context: { sub: claims.sub },
        }
    } catch {
        throw new Error("Unauthorized")
    }
}
