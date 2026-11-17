import * as cdk from "aws-cdk-lib"
import { BackendStack } from "../lib/backend-stack"

const app = new cdk.App()

new BackendStack(app, "ChatbotPagamentosStack", {
    // Todos os recursos em us-east-1 (exigência do desafio).
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
    // Origem do app no Amplify, ex.: https://main.d1a2b3c4d5.amplifyapp.com  (sem barra no final)
    // Passe com: npx cdk deploy -c frontendOrigin=https://main.xxxx.amplifyapp.com
    frontendOrigin: app.node.tryGetContext("frontendOrigin") ?? "http://localhost:5173",
    // Perfil de inferência do Claude Haiku 4.5 (geo US) no Bedrock.
    modelId: app.node.tryGetContext("modelId") ?? "us.anthropic.claude-haiku-4-5",
})
