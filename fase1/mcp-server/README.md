# Servidor MCP

Servidor Model Context Protocol com as três tools do desafio: `listar_catalogo`, `registrar_intencao` e `realizar_compra`. Uma tool por arquivo em `src/tools/`.

> **Este pacote não roda sozinho em uso normal.** O backend o inicia como processo filho via stdio ao subir, então basta rodar o backend. Só precisa de `npm install` uma vez.
>
> Os contratos completos das tools (argumentos, retorno e tabelas de erro) estão no [README da raiz](../README.md#tools-mcp).

## Testando as tools isoladamente

A partir da pasta `backend/`, para que o `.env` seja encontrado:

```bash
npx @modelcontextprotocol/inspector npx tsx ../mcp-server/src/index.ts
```

O inspector não envia o `_meta` de identidade, então só `listar_catalogo` funciona por ali — as outras duas respondem `INTENCAO_INVALIDA`. Isso é o comportamento correto, não um bug.

## Convenções

- Nomes de tool, argumentos e campos de retorno em **português**; banco e código em **inglês**. O mapeamento é feito no handler.
- `inputSchema`/`outputSchema` são **shapes zod crus** (`{ campo: z.string() }`), não `z.object({...})` — o SDK embrulha.
- Todo argumento leva `.describe("...")` em português: é o que o modelo lê.
- Recusas passam por `src/tools/recusar.ts`, o formato único `{ status: "recusado", erro, mensagem }`.
- O acesso ao banco vem de `backend/src/` (as tools importam `db` e os serviços de lá): `mcp-server/node_modules` não tem `drizzle-orm`, então qualquer tool que precise de operadores do Drizzle deve seguir o padrão de serviço no backend + adaptador fino aqui.
