import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb"

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

// Nomes das tabelas vêm de variáveis de ambiente definidas pelo CDK (nunca fixos no código).
export function tableName(envVar: string): string {
    const value = process.env[envVar]
    if (!value) throw new Error(`Variável de ambiente ausente: ${envVar}`)
    return value
}
