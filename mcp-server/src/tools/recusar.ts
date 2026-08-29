// Forma única de recusa para todas as tools, para o modelo aprender um formato só.
//
// Vai com `isError: true` e sem `structuredContent` de propósito: é isso que permite
// conviver com um outputSchema de sucesso, porque o SDK pula a validação de saída
// quando o resultado é de erro. O agent loop só encaminha a parte `text` ao modelo,
// então a `mensagem` em português é o que ele lê.
export function recusar(erro: string, mensagem: string) {
    const payload = { status: "recusado" as const, erro, mensagem }

    return {
        content: [{ type: "text" as const, text: JSON.stringify(payload) }],
        isError: true,
    }
}
