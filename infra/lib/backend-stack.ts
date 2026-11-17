import * as fs from "node:fs"
import * as path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as agentcore from "aws-cdk-lib/aws-bedrockagentcore"
import * as apigw from "aws-cdk-lib/aws-apigateway"
import * as cognito from "aws-cdk-lib/aws-cognito"
import * as cr from "aws-cdk-lib/custom-resources"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as iam from "aws-cdk-lib/aws-iam"
import * as lambda from "aws-cdk-lib/aws-lambda"
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs"
import * as logs from "aws-cdk-lib/aws-logs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export interface BackendStackProps extends cdk.StackProps {
    frontendOrigin: string
    modelId: string
}

export class BackendStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: BackendStackProps) {
        super(scope, id, props)

        const { frontendOrigin, modelId } = props

        // ───────────────────────── Cognito (login, só por convite) ─────────────────────────
        const userPool = new cognito.UserPool(this, "UserPool", {
            userPoolName: "chatbot-pagamentos-users",
            // Auto cadastro desligado: equivale a AdminCreateUserConfig.AllowAdminCreateUserOnly = true.
            // Chamadas de SignUp direto na API do Cognito também são recusadas.
            selfSignUpEnabled: false,
            signInAliases: { email: true },
            autoVerify: { email: true },
            standardAttributes: { email: { required: true, mutable: false } },
            passwordPolicy: { minLength: 8, requireLowercase: true, requireUppercase: true, requireDigits: true },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            // E-mail de convite (invitation message) com usuário e senha temporária.
            userInvitation: {
                emailSubject: "Seu acesso ao Assistente de Compras",
                emailBody:
                    "Olá! Você foi convidado(a) para o Assistente de Compras.<br/><br/>" +
                    "Usuário: <strong>{username}</strong><br/>" +
                    "Senha temporária: <strong>{####}</strong><br/><br/>" +
                    "No primeiro acesso você será solicitado(a) a definir uma nova senha.",
            },
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        })

        const userPoolClient = userPool.addClient("WebClient", {
            userPoolClientName: "web",
            generateSecret: false, // app de navegador não guarda segredo
            authFlows: { userSrp: true },
            preventUserExistenceErrors: true,
            idTokenValidity: cdk.Duration.hours(1),
            accessTokenValidity: cdk.Duration.hours(1),
        })

        // ───────────────────────── DynamoDB ─────────────────────────
        const newTable = (name: string, partitionKey: dynamodb.Attribute, sortKey?: dynamodb.Attribute) =>
            new dynamodb.Table(this, name, {
                partitionKey,
                sortKey,
                billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
            })

        const S = dynamodb.AttributeType.STRING
        const usersTable = newTable("UsersTable", { name: "userId", type: S })
        const conversationsTable = newTable(
            "ConversationsTable",
            { name: "userId", type: S },
            { name: "conversationId", type: S }
        )
        const productsTable = newTable("ProductsTable", { name: "productId", type: S })
        const intentionsTable = newTable("IntentionsTable", { name: "intentionId", type: S })
        const transactionsTable = newTable("TransactionsTable", { name: "intentionId", type: S })

        // Catálogo inicial (mesmos produtos da Fase 1), gravado na criação da stack.
        const catalogo = [
            { id: "10000000-0000-0000-0000-000000000001", nome: "Fone Bluetooth", cents: 24990, stock: 12, cat: "audio" },
            { id: "10000000-0000-0000-0000-000000000002", nome: "Teclado Mecânico", cents: 45900, stock: 5, cat: "perifericos" },
            { id: "10000000-0000-0000-0000-000000000003", nome: "Mouse Sem Fio", cents: 12950, stock: 30, cat: "perifericos" },
        ]
        catalogo.forEach((p, i) => {
            new cr.AwsCustomResource(this, `SeedProduto${i + 1}`, {
                installLatestAwsSdk: false,
                onCreate: {
                    service: "DynamoDB",
                    action: "putItem",
                    parameters: {
                        TableName: productsTable.tableName,
                        Item: {
                            productId: { S: p.id },
                            name: { S: p.nome },
                            priceCents: { N: String(p.cents) },
                            currency: { S: "BRL" },
                            stock: { N: String(p.stock) },
                            category: { S: p.cat },
                        },
                    },
                    physicalResourceId: cr.PhysicalResourceId.of(`seed-produto-${p.id}`),
                },
                policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [productsTable.tableArn] }),
            })
        })

        // ───────────────────────── Lambdas das tools ─────────────────────────
        const logGroup = (name: string) =>
            new logs.LogGroup(this, `${name}Logs`, {
                retention: logs.RetentionDays.ONE_WEEK,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
            })

        const fn = (
            name: string,
            entry: string,
            environment: Record<string, string>,
            extra: Partial<cdk.aws_lambda_nodejs.NodejsFunctionProps> = {}
        ) =>
            new NodejsFunction(this, name, {
                entry: path.join(ROOT, entry),
                handler: "handler",
                runtime: lambda.Runtime.NODEJS_22_X,
                architecture: lambda.Architecture.ARM_64,
                memorySize: 256,
                timeout: cdk.Duration.seconds(15),
                environment,
                logGroup: logGroup(name),
                depsLockFilePath: path.join(ROOT, "package-lock.json"),
                bundling: { externalModules: [], minify: true, sourceMap: false },
                ...extra,
            })

        const listarCatalogoFn = fn("ListarCatalogoFn", "tools/src/listar-catalogo.ts", {
            PRODUCTS_TABLE: productsTable.tableName,
        })
        const registrarIntencaoFn = fn("RegistrarIntencaoFn", "tools/src/registrar-intencao.ts", {
            PRODUCTS_TABLE: productsTable.tableName,
            INTENTIONS_TABLE: intentionsTable.tableName,
        })
        const realizarCompraFn = fn("RealizarCompraFn", "tools/src/realizar-compra.ts", {
            INTENTIONS_TABLE: intentionsTable.tableName,
            PRODUCTS_TABLE: productsTable.tableName,
            USERS_TABLE: usersTable.tableName,
            TRANSACTIONS_TABLE: transactionsTable.tableName,
            DEFAULT_LIMIT_CENTS: "500000", // limite inicial de cada usuário: R$ 5.000,00
        })

        // Menor privilégio: cada tool só pode fazer estas ações, só nestas tabelas.
        const allow = (f: lambda.IFunction, table: dynamodb.ITable, actions: string[]) =>
            f.addToRolePolicy(new iam.PolicyStatement({ actions: actions.map((a) => `dynamodb:${a}`), resources: [table.tableArn] }))

        allow(listarCatalogoFn, productsTable, ["Scan"])
        allow(registrarIntencaoFn, productsTable, ["GetItem"])
        allow(registrarIntencaoFn, intentionsTable, ["PutItem"])
        allow(realizarCompraFn, intentionsTable, ["GetItem", "UpdateItem"])
        allow(realizarCompraFn, usersTable, ["GetItem", "PutItem", "UpdateItem"])
        allow(realizarCompraFn, productsTable, ["GetItem", "UpdateItem"])
        allow(realizarCompraFn, transactionsTable, ["PutItem"])

        // ───────────────────────── Agente (Strands no AgentCore Runtime) ─────────────────────────
        const agentDir = path.join(ROOT, "agent")

        const pipArgs = (target: string, requirements: string) => [
            "-m", "pip", "install", "--quiet", "--upgrade",
            "--platform", "manylinux2014_aarch64", "--platform", "manylinux_2_28_aarch64",
            "--only-binary=:all:", "--python-version", "3.12", "--implementation", "cp",
            "--target", target, "-r", requirements,
        ]

        const agentArtifact = agentcore.AgentRuntimeArtifact.fromCodeAsset({
            path: agentDir,
            runtime: agentcore.AgentCoreRuntime.PYTHON_3_12,
            entrypoint: ["main.py"],
            exclude: ["__pycache__", ".venv", "*.pyc"],
            bundling: {
                // O AgentCore roda em Linux ARM64: baixamos as dependências para essa plataforma.
                // 1ª opção: pip local (sem Docker). 2ª opção (se o pip falhar): container Docker.
                image: cdk.DockerImage.fromRegistry("public.ecr.aws/docker/library/python:3.12"),
                command: [
                    "bash", "-c",
                    "pip install --quiet --platform manylinux2014_aarch64 --platform manylinux_2_28_aarch64 " +
                        "--only-binary=:all: --python-version 3.12 --implementation cp " +
                        "--target /asset-output -r requirements.txt && cp main.py /asset-output/",
                ],
                local: {
                    tryBundle(outputDir: string) {
                        for (const python of ["python3", "python", "py"]) {
                            const r = spawnSync(python, pipArgs(outputDir, path.join(agentDir, "requirements.txt")), {
                                stdio: "inherit",
                            })
                            if (r.status === 0) {
                                fs.copyFileSync(path.join(agentDir, "main.py"), path.join(outputDir, "main.py"))
                                return true
                            }
                        }
                        return false
                    },
                },
            },
        })

        // Role de execução do runtime: só o que o agente precisa.
        const agentRole = new iam.Role(this, "AgentRuntimeRole", {
            assumedBy: new iam.ServicePrincipal("bedrock-agentcore.amazonaws.com", {
                conditions: {
                    StringEquals: { "aws:SourceAccount": this.account },
                    ArnLike: { "aws:SourceArn": `arn:aws:bedrock-agentcore:${this.region}:${this.account}:*` },
                },
            }),
            description: "Execução do agente Strands: invoca o modelo, chama as Lambdas das tools e grava logs.",
        })

        // 1) Invocar o modelo. O perfil de inferência US roteia entre us-east-1/us-east-2/us-west-2,
        //    então o modelo base precisa ser liberado nessas 3 regiões (apenas este modelo).
        const baseModelId = modelId.replace(/^(us|global)\./, "")
        agentRole.addToPolicy(
            new iam.PolicyStatement({
                actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
                resources: [
                    `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${modelId}`,
                    ...["us-east-1", "us-east-2", "us-west-2"].map((r) => `arn:aws:bedrock:${r}::foundation-model/${baseModelId}`),
                ],
            })
        )
        // 2) Chamar SOMENTE as 3 Lambdas das tools.
        agentRole.addToPolicy(
            new iam.PolicyStatement({
                actions: ["lambda:InvokeFunction"],
                resources: [listarCatalogoFn.functionArn, registrarIntencaoFn.functionArn, realizarCompraFn.functionArn],
            })
        )
        // 3) Logs, métricas e acesso a tokens de workload do runtime: o construct L2 do AgentCore já
        //    acrescenta essas permissões (escopadas aos logs do runtime) à role. Ver README, seção IAM.

        const runtime = new agentcore.Runtime(this, "AgentRuntime", {
            runtimeName: "chatbot_pagamentos_agent",
            description: "Agente de compras (Strands + Bedrock) que chama as tools em Lambda",
            agentRuntimeArtifact: agentArtifact,
            executionRole: agentRole,
            environmentVariables: {
                MODEL_ID: modelId,
                TOOL_LISTAR_CATALOGO: listarCatalogoFn.functionName,
                TOOL_REGISTRAR_INTENCAO: registrarIntencaoFn.functionName,
                TOOL_REALIZAR_COMPRA: realizarCompraFn.functionName,
            },
        })

        // ───────────────────────── Lambdas da API ─────────────────────────
        const authorizerFn = fn(
            "JwtAuthorizerFn",
            "api/src/authorizer.ts",
            { USER_POOL_ID: userPool.userPoolId, USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId },
            { timeout: cdk.Duration.seconds(10) }
        )

        const chatFn = fn(
            "ChatFn",
            "api/src/chat.ts",
            {
                CONVERSATIONS_TABLE: conversationsTable.tableName,
                AGENT_RUNTIME_ARN: runtime.agentRuntimeArn,
                ALLOWED_ORIGIN: frontendOrigin,
            },
            { timeout: cdk.Duration.minutes(5), memorySize: 512 }
        )
        allow(chatFn, conversationsTable, ["GetItem", "PutItem"])
        runtime.grantInvokeRuntime(chatFn) // bedrock-agentcore:InvokeAgentRuntime só neste runtime

        const conversasFn = fn("ConversasFn", "api/src/conversas.ts", {
            CONVERSATIONS_TABLE: conversationsTable.tableName,
            ALLOWED_ORIGIN: frontendOrigin,
        })
        allow(conversasFn, conversationsTable, ["GetItem"])

        // ───────────────────────── API Gateway (REST, com streaming) ─────────────────────────
        const api = new apigw.RestApi(this, "Api", {
            restApiName: "chatbot-pagamentos-api",
            endpointTypes: [apigw.EndpointType.REGIONAL],
            cloudWatchRole: false, // não mexe na configuração de logs do API Gateway que é da conta inteira
            deployOptions: { stageName: "prod", throttlingRateLimit: 5, throttlingBurstLimit: 10 },
            // CORS: só a origem do app no Amplify.
            defaultCorsPreflightOptions: {
                allowOrigins: [frontendOrigin],
                allowMethods: ["GET", "POST", "OPTIONS"],
                allowHeaders: ["Content-Type", "Authorization"],
                maxAge: cdk.Duration.hours(1),
            },
        })

        // Respostas de erro do próprio gateway (ex.: 401) também precisam do header CORS,
        // senão o navegador esconde o status real.
        const corsHeaders = { "Access-Control-Allow-Origin": `'${frontendOrigin}'` }
        api.addGatewayResponse("Unauthorized", { type: apigw.ResponseType.UNAUTHORIZED, statusCode: "401", responseHeaders: corsHeaders })
        api.addGatewayResponse("AccessDenied", { type: apigw.ResponseType.ACCESS_DENIED, statusCode: "403", responseHeaders: corsHeaders })
        api.addGatewayResponse("Default4xx", { type: apigw.ResponseType.DEFAULT_4XX, responseHeaders: corsHeaders })
        api.addGatewayResponse("Default5xx", { type: apigw.ResponseType.DEFAULT_5XX, responseHeaders: corsHeaders })

        // Autorizador JWT do Cognito. Exige "Authorization: Bearer <jwt>"; sem esse formato o gateway
        // responde 401 sem executar nada. Token inválido/expirado: o autorizador nega e o gateway responde 401.
        const authorizer = new apigw.TokenAuthorizer(this, "JwtAuthorizer", {
            handler: authorizerFn,
            identitySource: "method.request.header.Authorization",
            validationRegex: "^Bearer [A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$",
            resultsCacheTtl: cdk.Duration.seconds(0),
        })

        api.root.addResource("chat").addMethod(
            "POST",
            new apigw.LambdaIntegration(chatFn, {
                // STREAM: o texto chega ao navegador conforme o agente escreve (experiência de chat).
                responseTransferMode: apigw.ResponseTransferMode.STREAM,
                timeout: cdk.Duration.minutes(5),
            }),
            { authorizer }
        )
        api.root.addResource("conversas").addMethod("GET", new apigw.LambdaIntegration(conversasFn), { authorizer })

        // ───────────────────────── Saídas (usadas no frontend/Amplify) ─────────────────────────
        new cdk.CfnOutput(this, "ApiUrl", { value: api.url.replace(/\/$/, ""), description: "VITE_API_URL" })
        new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId, description: "VITE_USER_POOL_ID" })
        new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId, description: "VITE_USER_POOL_CLIENT_ID" })
        new cdk.CfnOutput(this, "AgentRuntimeArn", { value: runtime.agentRuntimeArn })
    }
}
