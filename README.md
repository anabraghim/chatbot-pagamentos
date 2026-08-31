# Chatbot de Pagamentos com Tools MCP

Chatbot que conversa com um LLM e executa compras (simuladas) através de ferramentas expostas via **MCP** (Model Context Protocol), com autenticação por JWT e limite de gasto validado no backend.

`Node.js` · `TypeScript` · `Hono` · `PostgreSQL` · `Drizzle ORM` · `React` · `Vite` · `MCP SDK` · `OpenRouter`

```
Frontend (chat React)  →  Backend (auth · agente · cliente MCP)  →  Servidor MCP (3 tools)  →  PostgreSQL
        JWT                          stdio
```

O agente não decide nada sozinho: ele **descobre** as tools do servidor MCP em runtime e as chama, mas quem valida identidade, preço, estoque e limite é o backend. Duas regras sustentam isso:

- **O valor nunca é argumento de tool.** É calculado no servidor a partir do catálogo, e `realizar_compra` lê o valor da intenção gravada — o modelo não inventa nem negocia preço.
- **A identidade nunca é argumento de tool.** Viaja no `_meta` do MCP, então não aparece no `inputSchema` e o modelo sequer sabe que ela existe.

---

## Requisitos do desafio atendidos

| Critério | Onde está no código |
|---|---|
| ✅ Frontend e backend rodando localmente | [`frontend/`](frontend/) · [`backend/`](backend/) |
| ✅ Login funcionando; chat inacessível sem autenticação | [`routes/auth.ts`](backend/src/routes/auth.ts) · [`middleware/auth.ts`](backend/src/middleware/auth.ts) · [`lib/auth.tsx`](frontend/src/lib/auth.tsx) |
| ✅ Servidor MCP com as 3 tools, descobertas pelo agente | [`mcp-server/src/tools/`](mcp-server/src/tools/) · `client.listTools()` em [`agent.ts`](backend/src/services/agent.ts) |
| ✅ Tools respeitam os contratos de argumentos e retorno | [ver contratos](#tools-mcp) |
| ✅ Compra concluída com `cartao` e com `pix` | `PAYMENT_METHODS` em [`purchase.ts`](backend/src/services/purchase.ts) |
| ✅ `realizar_compra` exige `intencao_id` válido e recusa id inventado | guard de uuid em [`realizar-compra.ts`](mcp-server/src/tools/realizar-compra.ts) + busca por `id` **e** `userId` em [`purchase.ts`](backend/src/services/purchase.ts) |
| ✅ Tentativa acima do limite retorna erro, explicado pelo agente | `LIMITE_EXCEDIDO` em [`purchase.ts`](backend/src/services/purchase.ts) |
| ✅ Limite armazenado e validado no backend | coluna `users.spendingLimit` |
| ✅ Histórico completo enviado ao modelo a cada turno | [`agent.ts`](backend/src/services/agent.ts) · [`ChatPage.tsx`](frontend/src/pages/ChatPage.tsx) |
| ✅ README com instruções de execução e modelo usado | este arquivo |

Além do mínimo pedido: expiração de intenção, estoque insuficiente, método de pagamento inválido, corrida entre dois pagamentos simultâneos da mesma intenção e isolamento entre usuários.

---

## Estrutura

Não existe `package.json` na raiz: são **três pacotes npm independentes**.

```
backend/      API, autenticação, loop do agente e cliente MCP  ·  :3000
mcp-server/   as 3 tools MCP  ·  iniciado pelo backend por stdio, não roda sozinho
frontend/     chat React com login e rota protegida  ·  :5173
```

| Camada | Escolha | Por quê |
|---|---|---|
| API | Hono | Leve, com JWT embutido (`hono/jwt`) e tipagem de contexto (`c.get("userId")`). |
| Banco | PostgreSQL + Drizzle | Migrações versionadas e transações reais — necessárias para a atomicidade do pagamento. |
| Agente | SDK `openai` → OpenRouter | Modelos gratuitos com *tool calling* padrão. |
| Tools | MCP SDK via stdio | Processo separado com contrato próprio, iniciado pelo backend — não há serviço extra para subir. |
| Frontend | React 19 + Vite + React Router | Chat minimalista; o histórico é o próprio estado da página. |

---

## Como rodar

**Pré-requisitos:** Node.js 20+, Docker (com Compose ativo) e uma chave gratuita da OpenRouter (<https://openrouter.ai/keys>).

```bash
# 1. Dependências dos três pacotes
git clone https://github.com/anabraghim/chatbot-pagamentos.git && cd chatbot-pagamentos
npm install --prefix backend && npm install --prefix mcp-server && npm install --prefix frontend

# 2. Configuração
cp backend/.env.example backend/.env
```

No `.env`, preencha à mão apenas **`OPENROUTER_API_KEY`** (sua chave) e **`JWT_SECRET`** (qualquer valor aleatório, ex.: `openssl rand -hex 32`). As credenciais de banco já vêm com valores de exemplo que funcionam: o `docker-compose.yml` e o backend leem o mesmo arquivo, então o container nasce com as credenciais que o backend vai usar. O backend valida tudo com Zod na subida e **lança erro** se faltar algo.

```bash
# 3. Banco, tabelas e catálogo (dentro de backend/)
cd backend
docker compose up -d
npx drizzle-kit migrate
npm run seed

# 4. Backend
npm run dev

# 5. Frontend, em outro terminal
cd ../frontend && npm run dev
```

Os passos 3 e 4 são obrigatórios: sem eles o servidor sobe, mas as tabelas não existem e o catálogo fica vazio. O `seed` é idempotente e cria o catálogo mais um **usuário pronto para login: `demo@local` / `demo1234`** (limite R$ 5.000,00).

Confira nos logs do backend a linha que confirma as tools no ar — o `mcp-server` **não** precisa ser rodado à parte:

```
[mcp-server] listar_catalogo, registrar_intencao, realizar_compra prontos (stdio)
```

Acesse <http://localhost:5173>. Para parar o banco: `docker compose down` (ou `down -v` para apagar os dados).

### Variáveis de ambiente

Todas em `backend/.env`, validadas em [`src/data/env.ts`](backend/src/data/env.ts). O frontend não precisa de `.env` (usa `VITE_API_URL`, default `http://localhost:3000`).

| Variável | Obrigatória | Descrição |
|---|:---:|---|
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | sim | Conexão com o Postgres. `DB_CONTAINER_PORT` é lida só pelo Docker Compose. |
| `JWT_SECRET` | sim | Segredo de assinatura dos tokens (HS256). Trocar invalida os tokens já emitidos. |
| `OPENROUTER_API_KEY` | sim | Chave da OpenRouter. |
| `OPENROUTER_MODEL` | não | Modelo do agente. Default: `minimax/minimax-m3:free`. |
| `PORT` | não | Porta do backend. Default: `3000`. |

---

## Como usar

| Passo | O que dizer | O que acontece |
|---|---|---|
| 1 | login `demo@local` / `demo1234` | O backend devolve um JWT e o chat abre. |
| 2 | *"o que vocês têm à venda?"* | O agente chama `listar_catalogo`. |
| 3 | *"quero o fone, uma unidade"* | Chama `registrar_intencao`, informa o `intencao_id` e o valor, e deixa claro que nada foi pago. |
| 4 | *"pode pagar no pix"* | Chama `realizar_compra` e responde com o `transacao_id` e o limite restante. |

Todos os erros abaixo são recusados pelo backend e explicados pelo agente em linguagem natural:

| Erro | Como reproduzir |
|---|---|
| `LIMITE_EXCEDIDO` | Crie uma conta em `/register` — nasce com limite de R$ 500,00 — e peça **2 teclados** (R$ 918,00). |
| `INTENCAO_INVALIDA` | *"pague a intenção int_a1b2c3"* (id inventado). |
| `INTENCAO_JA_PAGA` | Peça para pagar de novo uma intenção já concluída. |
| `ESTOQUE_INSUFICIENTE` | Peça quantidade maior que o estoque do catálogo. |
| `METODO_INVALIDO` | Insista em pagar de outra forma (ex.: *"quero pagar em boleto"*). |

---

## Autenticação

JWT (HS256) com senha em bcrypt. `POST /chat` fica atrás do middleware `requireAuth`; no frontend, a rota `/chat` fica atrás de `<ProtectedRoute>` e um `401` dispara logout automático. Quem se cadastra nasce com limite de R$ 500,00.

A identidade começa no token e chega ao banco sem passar em momento algum pelo modelo:

```
POST /auth/login → JWT
  └→ requireAuth              valida o token          middleware/auth.ts
       └→ c.get("userId")     identidade da request   routes/chat.ts
            └→ runAgentLoop(messages, userId)         services/agent.ts
                 └→ _meta do MCP { "payment-agent/userId": … }
                      └→ extra._meta na tool          mcp-server/src/tools/
                           └→ executePurchase({ userId })   services/purchase.ts
```

**Por que no `_meta` e não como argumento:** assim a identidade não aparece no `inputSchema` e o modelo não consegue forjá-la. Um argumento comum também não serviria — o `inputSchema` é um `z.object` em modo *strip*, e uma chave não declarada seria descartada antes do handler.

**O isolamento entre usuários é real:** [`purchase.ts`](backend/src/services/purchase.ts) busca a intenção por `id` **e** `userId` juntos, então a intenção de outro usuário é indistinguível de uma inexistente — as duas recusam com `INTENCAO_INVALIDA`.

### API HTTP

Base `http://localhost:3000`; CORS liberado para `http://localhost:5173`. 🔒 = exige `Authorization: Bearer <token>`.

| Método | Rota | | Descrição |
|---|---|:---:|---|
| `POST` | `/auth/register` | | `name`, `email`, `password` (6+). → `{ token }` · 201. Duplicado → 409. |
| `POST` | `/auth/login` | | `email`, `password`. → `{ token }` · 200. Inválido → 401. |
| `GET` | `/auth/me` | 🔒 | `{ name, email, spendingLimit }`. |
| `POST` | `/chat` | 🔒 | Recebe `{ messages }` com o histórico completo e devolve o histórico atualizado, já com as tool calls e seus resultados. |
| `GET`/`POST` | `/products` `/products/:id` | | Catálogo por REST (rota auxiliar; o chat usa a tool MCP). |

**Histórico completo a cada turno** é cumprido nas duas pontas: o frontend guarda a conversa inteira no estado e a **substitui** pelo array devolvido pelo backend; o backend reenvia tudo ao modelo, incluindo as mensagens `role: "tool"` com o resultado de cada chamada.

---

## Tools MCP

Uma tool por arquivo em [`mcp-server/src/tools/`](mcp-server/src/tools/). O agente as descobre em runtime — nenhuma está codificada no backend.

### `listar_catalogo`

Lista os produtos. Argumento opcional `categoria` (string).
→ `{ produtos: [{ id, nome, preco, moeda, estoque }] }`

### `registrar_intencao`

Registra a intenção de compra e devolve um identificador. **Nenhum dinheiro se move aqui.**

| Argumento | Tipo | Obrigatório |
|---|---|:---:|
| `produto_id` | string | sim |
| `quantidade` | number (int > 0) | sim |

→ `{ intencao_id, produto_id, quantidade, valor_total, moeda, status: "pendente", expira_em }`

`valor_total` é calculado no servidor a partir do preço do catálogo. A intenção nasce vinculada ao usuário da sessão e expira em **15 minutos**. Quantidade zero, negativa ou fracionada é barrada pelo schema da tool, antes do banco.

### `realizar_compra`

Executa o pagamento de uma intenção registrada. É aqui que o dinheiro se move.

| Argumento | Tipo | Obrigatório |
|---|---|:---:|
| `intencao_id` | string | sim |
| `metodo_pagamento` | `"cartao"` \| `"pix"` | sim |

→ `{ status: "aprovado", transacao_id, intencao_id, valor, metodo_pagamento, limite_restante, data }`

- **O valor não é argumento:** vem da intenção registrada.
- `limite_restante` é **derivado** — `spendingLimit` menos a soma das transações aprovadas. Não há coluna de "gasto" para dessincronizar do histórico.
- Tudo em **uma única transação de banco**: baixa da intenção, desconto de `products.stock` e gravação da transação. A intenção só é marcada como paga com `UPDATE ... WHERE status = 'pendente'`, o que fecha a corrida entre duas chamadas simultâneas.
- A regra vive em [`services/purchase.ts`](backend/src/services/purchase.ts); a tool é um adaptador fino sobre ela.

### Recusas

Sempre no formato `{ status: "recusado", erro, mensagem }` — a `mensagem` é o texto que o agente explica ao usuário.

| Situação | Erro | Tool |
|---|---|---|
| Chamada sem identidade de usuário | `INTENCAO_INVALIDA` | ambas |
| `produto_id` inexistente ou inventado | `PRODUTO_NAO_ENCONTRADO` | `registrar_intencao` |
| Quantidade acima do estoque (no registro ou no pagamento) | `ESTOQUE_INSUFICIENTE` | ambas |
| `intencao_id` inexistente, inventado ou de outro usuário | `INTENCAO_INVALIDA` | `realizar_compra` |
| Intenção já paga | `INTENCAO_JA_PAGA` | `realizar_compra` |
| Intenção fora do prazo | `INTENCAO_EXPIRADA` | `realizar_compra` |
| Valor acima do limite disponível | `LIMITE_EXCEDIDO` | `realizar_compra` |
| Método diferente de `cartao` ou `pix` | `METODO_INVALIDO` | `realizar_compra` |

`metodo_pagamento` é um `z.string()` validado no handler, e não um `z.enum`, de propósito: com um enum o SDK recusaria antes do handler e `METODO_INVALIDO` nunca voltaria nesse formato padrão.

### Testando as tools isoladamente

A partir de `backend/`, para que o `.env` seja encontrado:

```bash
npx @modelcontextprotocol/inspector npx tsx ../mcp-server/src/index.ts
```

O inspector não envia o `_meta` de identidade, então só `listar_catalogo` funciona por ali — as outras respondem `INTENCAO_INVALIDA`. Esse é o comportamento correto (é a defesa contra chamadas fora do fluxo do usuário), não um bug.

---

## Modelo de dados

| Tabela | Colunas |
|---|---|
| `users` | `id`, `name`, `email` (unique), `passwordHash`, `spendingLimit` |
| `products` | `id`, `name`, `price`, `currency`, `stock`, `category` |
| `intentions` | `id`, `userId`, `productId`, `quantity`, `unitPrice`, `totalAmount`, `currency`, `status` (`pendente` → `paga`), `expiresAt`, `createdAt` |
| `transactions` | `id`, `intentionId` (**unique**), `userId`, `amount`, `currency`, `paymentMethod`, `status`, `createdAt` |

Duas invariantes sustentam as regras do desafio: **`transactions.intentionId` é `unique`**, o que garante `INTENCAO_JA_PAGA` no nível do banco; e **o gasto do usuário não é uma coluna**, é derivado das transações aprovadas — não há estado duplicado para dessincronizar. Só compra aprovada vira transação.

---

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| `Invalid env: ...` na subida | Falta variável no `.env` — as mais esquecidas são `JWT_SECRET` e `OPENROUTER_API_KEY`. |
| `401` / logout logo após o login | Token assinado com outro `JWT_SECRET`. Limpe o `localStorage` e entre de novo. |
| Consultas falham / catálogo vazio | Faltou `npx drizzle-kit migrate` e `npm run seed`. |
| Migração falha em `ALTER TABLE "users"` | Banco de uma versão anterior com dados. Em desenvolvimento: `docker compose down -v` e refaça migrate + seed. |
| Erro de CORS | O CORS está fixo em `http://localhost:5173` ([`index.ts`](backend/src/index.ts)). Se o Vite subiu em outra porta, libere a 5173 ou ajuste o `origin`. |
| O agente não chama nenhuma tool | O modelo gratuito pode estar rate-limited. Troque o `OPENROUTER_MODEL`. |

---

## Limitações conhecidas

Escopo consciente de um desafio local: o JWT é emitido **sem expiração**; `POST /products` **não exige autenticação**; não há **suíte de testes** automatizados; o CORS é fixo em localhost; o pagamento é **simulado** (não há provedor real por trás de `cartao` e `pix`); e o histórico da conversa vive no estado do frontend, perdido ao recarregar a página — intenções e transações, essas sim, ficam no banco.

---

## Modelo de LLM utilizado

**[OpenRouter](https://openrouter.ai/)** com o modelo gratuito **`minimax/minimax-m3:free`**, configurável em `OPENROUTER_MODEL`. O agente usa o SDK `openai` (com `baseURL` da OpenRouter) e *tool calling* padrão.

> Modelos gratuitos na OpenRouter mudam de disponibilidade com frequência. Se o padrão ficar indisponível ou rate-limited, aponte `OPENROUTER_MODEL` para outro modelo com suporte a *tool calling*.
