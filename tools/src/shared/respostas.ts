// Forma única de recusa para todas as tools (mesmo contrato da Fase 1):
// { status: "recusado", erro: "<CODIGO>", mensagem: "<texto em português para o usuário>" }
export interface Recusa {
    status: "recusado"
    erro: string
    mensagem: string
}

export function recusar(erro: string, mensagem: string): Recusa {
    return { status: "recusado", erro, mensagem }
}

// Dinheiro é guardado em centavos (inteiro) no DynamoDB para evitar erro de ponto flutuante.
export function reais(centavos: number): number {
    return Math.round(centavos) / 100
}

export function formatarBRL(centavos: number): string {
    return `BRL ${reais(centavos).toFixed(2)}`
}

export const FALHA_GENERICA = recusar(
    "FALHA_NA_FERRAMENTA",
    "Não foi possível concluir essa operação agora. Tente novamente em instantes."
)
