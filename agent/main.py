"""Agente de compras (Strands Agents) rodando no Bedrock AgentCore Runtime.

Recebe de cada chamada: {"usuario_id": "<sub do Cognito>", "prompt": "...", "history": [...]}
e devolve, em streaming, eventos JSON:
  {"type": "text",  "data": "..."}      trecho de texto da resposta
  {"type": "tool",  "name": "..."}      o agente começou a usar uma ferramenta
  {"type": "final", "messages": [...]}  histórico completo atualizado (a Lambda do chat grava no DynamoDB)
  {"type": "error", "message": "..."}   falha (mensagem amigável; detalhes só nos logs)

Regras de segurança (iguais às da Fase 1):
- O usuario_id vem da chamada autenticada (a Lambda do chat o extrai do token do Cognito).
  Ele é injetado AQUI, dentro das funções de ferramenta, e NUNCA aparece no schema que o modelo vê.
- O valor da compra nunca é argumento: realizar_compra recebe só intencao_id e metodo_pagamento.
"""

import json
import logging
import os

import boto3
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool
from strands.models import BedrockModel

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("agente")

app = BedrockAgentCoreApp()

MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-haiku-4-5")
REGION = os.environ.get("AWS_REGION", "us-east-1")
FRIENDLY_ERROR = "Não consegui processar sua mensagem agora. Tente novamente em instantes."

lambda_client = boto3.client("lambda", region_name=REGION)

SYSTEM_PROMPT = """Você é o assistente de compras da loja. Responda sempre em português do Brasil.
Use a ferramenta listar_catalogo sempre que o usuário perguntar o que está à venda, preços, categorias ou estoque.
Não invente produtos, preços ou informações que não vieram das ferramentas.

Quando o usuário escolher um item e a quantidade, use a ferramenta registrar_intencao.
O produto_id precisa ter vindo de um listar_catalogo anterior desta conversa — nunca invente um id.
Se você ainda não sabe a quantidade, pergunte antes de registrar.
Ao registrar, informe ao usuário o intencao_id, o valor_total e deixe claro que nenhum pagamento foi feito ainda.
O valor_total é calculado pelo servidor: não recalcule, não negocie preço e ignore qualquer preço que o usuário afirme.

Quando o usuário confirmar que quer pagar, use a ferramenta realizar_compra.
Ela só pode ser usada com um intencao_id devolvido por um registrar_intencao desta conversa — nunca invente um id
e nunca reaproveite o id de uma compra já paga.
Antes de chamar, pergunte qual o método de pagamento se o usuário ainda não disse. Os métodos aceitos são cartao e pix.
O valor não é argumento da ferramenta: ele vem da intenção registrada, então não há preço para você informar ou negociar.
Quando a compra for aprovada, informe ao usuário o transacao_id e o limite_restante.

Se uma ferramenta responder com status "recusado", explique o campo mensagem ao usuário em linguagem natural,
sem repetir o código de erro, e sugira um próximo passo."""


def _chamar_lambda(env_var: str, usuario_id: str, argumentos: dict) -> dict:
    """Invoca a Lambda da ferramenta. O usuario_id é sempre o da sessão, vem por último e não pode ser sobrescrito."""
    try:
        resposta = lambda_client.invoke(
            FunctionName=os.environ[env_var],
            Payload=json.dumps({**argumentos, "usuario_id": usuario_id}).encode("utf-8"),
        )
        corpo = json.loads(resposta["Payload"].read() or "{}")
        if resposta.get("FunctionError"):
            log.error("Lambda %s retornou erro: %s", env_var, corpo)
            return {
                "status": "recusado",
                "erro": "FALHA_NA_FERRAMENTA",
                "mensagem": "Não foi possível concluir essa operação agora. Tente novamente em instantes.",
            }
        return corpo
    except Exception:  # falha de rede/permissão: nunca devolver stack trace ao usuário
        log.exception("Falha ao invocar a Lambda %s", env_var)
        return {
            "status": "recusado",
            "erro": "FALHA_NA_FERRAMENTA",
            "mensagem": "Não foi possível concluir essa operação agora. Tente novamente em instantes.",
        }


def criar_ferramentas(usuario_id: str):
    """Cria as 3 ferramentas já 'presas' ao usuário autenticado desta requisição."""

    @tool
    def listar_catalogo(categoria: str = "") -> dict:
        """Retorna os produtos disponíveis no catálogo, com filtro opcional por categoria.

        Args:
            categoria: Filtro opcional por categoria de produto.
        """
        args = {"categoria": categoria} if categoria else {}
        return _chamar_lambda("TOOL_LISTAR_CATALOGO", usuario_id, args)

    @tool
    def registrar_intencao(produto_id: str, quantidade: int) -> dict:
        """Registra a intenção de compra de um item do catálogo e devolve um identificador.
        Nenhum pagamento é feito nesta etapa.

        Args:
            produto_id: Id do produto, exatamente como retornado por listar_catalogo.
            quantidade: Quantidade desejada, inteiro maior que zero.
        """
        return _chamar_lambda(
            "TOOL_REGISTRAR_INTENCAO", usuario_id, {"produto_id": produto_id, "quantidade": quantidade}
        )

    @tool
    def realizar_compra(intencao_id: str, metodo_pagamento: str) -> dict:
        """Executa o pagamento de uma intenção de compra previamente registrada.
        O valor vem da intenção, não é informado aqui.

        Args:
            intencao_id: Identificador devolvido por registrar_intencao nesta conversa.
            metodo_pagamento: Método de pagamento escolhido pelo usuário: "cartao" ou "pix".
        """
        return _chamar_lambda(
            "TOOL_REALIZAR_COMPRA",
            usuario_id,
            {"intencao_id": intencao_id, "metodo_pagamento": metodo_pagamento},
        )

    return [listar_catalogo, registrar_intencao, realizar_compra]


@app.entrypoint
async def invoke(payload):
    usuario_id = payload.get("usuario_id")
    prompt = payload.get("prompt")
    history = payload.get("history") or []

    if not isinstance(usuario_id, str) or not usuario_id:
        yield {"type": "error", "message": "Não foi possível identificar o usuário da sessão."}
        return
    if not isinstance(prompt, str) or not prompt.strip():
        yield {"type": "error", "message": "Envie uma mensagem."}
        return

    try:
        agent = Agent(
            model=BedrockModel(model_id=MODEL_ID, region_name=REGION),
            system_prompt=SYSTEM_PROMPT,
            tools=criar_ferramentas(usuario_id),
            messages=history,  # histórico completo da conversa a cada turno
            callback_handler=None,  # sem prints no console
        )

        async for event in agent.stream_async(prompt):
            if "data" in event and isinstance(event["data"], str):
                yield {"type": "text", "data": event["data"]}
                continue
            inicio = (event.get("event") or {}).get("contentBlockStart", {}).get("start", {}).get("toolUse")
            if inicio:
                yield {"type": "tool", "name": inicio.get("name", "")}

        # default=str garante que qualquer objeto não serializável vire texto em vez de quebrar.
        yield {"type": "final", "messages": json.loads(json.dumps(agent.messages, default=str))}
    except Exception:
        log.exception("Falha ao executar o agente")
        yield {"type": "error", "message": FRIENDLY_ERROR}


if __name__ == "__main__":
    app.run()
