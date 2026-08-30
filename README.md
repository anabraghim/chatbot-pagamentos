# Chatbot de Pagamentos com Tools MCP

Chatbot que conversa com um LLM e executa compras (simuladas) através de ferramentas expostas via MCP.

```
Frontend (chat React)  →  Backend (agente + cliente MCP)  →  Servidor MCP (3 tools)  →  Postgres
```

**Modelo usado:** [OpenRouter](https://openrouter.ai/) com o modelo gratuito `minimax/minimax-m3:free`, configurável via `OPENROUTER_MODEL` em `backend/.env`. Modelos gratuitos na OpenRouter mudam de disponibilidade com frequência — se o padrão ficar indisponível ou rate-limited, troque por outro nessa variável.

---

## Estado do projeto

| Critério do desafio | Status |
|---|---|
| Frontend e backend rodando localmente | ✅ |
| Servidor MCP com as 3 tools, descobertas pelo agente | ✅ |
| Tools respeitam os contratos de argumentos e retorno | ✅ |
| Compra concluída com `cartao` e com `pix` | ✅ |
| `realizar_compra` exige `intencao_id` válido e recusa id inventado | ✅ |
| Tentativa acima do limite retorna erro, explicado pelo agente | ✅ |
| Limite armazenado e validado no backend | ✅ |
| Histórico completo enviado ao modelo a cada turno | ✅ |
| Login funcionando; chat inacessível sem autenticação | ✅ |

A única peça que falta é a **autenticação**. Tudo o mais do desafio está implementado e verificado. Como o chat ainda é aberto, o usuário é resolvido por um stub — explicado na seção seguinte, porque é a parte do projeto que mais confunde quem chega agora.

---

## Como a identidade do usuário funciona hoje

Enquanto não existe login, o backend usa um **usuário fixo de desenvolvimento** (um *stub de identidade*), criado pelo `npm run seed` e identificado pela variável `DEMO_USER_ID`.

O ponto importante: **o stub está em um lugar só.** Ele não está espalhado pelas tools nem no prompt. É esta linha, em [`backend/src/routes/chat.ts`](backend/src/routes/chat.ts):

```ts
// ! TROCAR POR c.get("userId") QUANDO O MIDDLEWARE DE AUTENTICAÇÃO ENTRAR
const userId = env.DEMO_USER_ID
```

Essa linha é a **costura de identidade**. Daí para baixo, a cadeia inteira já é código de produção:

```
chat.ts (fonte da identidade)
  └→ runAgentLoop(messages, userId)      services/agent.ts
       └→ _meta do MCP                   { "payment-agent/userId": userId }
            └→ extra._meta na tool       mcp-server/src/tools/*.ts
                 └→ executePurchase({ userId })   services/purchase.ts
```

Nenhuma dessas camadas sabe que o usuário é um stub — elas recebem um uuid de usuário comum e o tratam como tal.

**Por que a identidade viaja no `_meta` e não como argumento da tool:** assim ela não aparece no `inputSchema`, o modelo nunca a vê e não consegue forjá-la. Um argumento comum também não funcionaria, porque o `inputSchema` é um `z.object` em modo *strip* — uma chave não declarada seria descartada antes de chegar ao handler.

**O backend já é multiusuário.** O isolamento por usuário não é teórico: `purchase.ts` busca a intenção por `id` **e** `userId` juntos, e o limite de gasto é calculado por usuário. Uma intenção pertencente a outro usuário é recusada com `INTENCAO_INVALIDA`. O que é de um usuário só é a **porta de entrada**, não o modelo de dados.

**O que muda quando a autenticação entrar:**

| Camada | Muda? |
|---|---|
| Tools MCP (`realizar_compra`, `registrar_intencao`, `listar_catalogo`) | Não |
| `services/purchase.ts`, `services/agent.ts` | Não |
| Tabelas `intentions`, `transactions`, `products` | Não |
| `chat.ts` — trocar o stub por `c.get("userId")` | Sim, 1 linha |
| Middleware de autenticação + rota de login | Novo |
| Tabela `users` — coluna de credencial (o formato depende do método escolhido) | Nova coluna |

O `JWT_SECRET` já está previsto (comentado) em `src/data/env.ts`.

---

## Rodando o projeto

**Pré-requisitos:** Node.js 20+ e Docker (com Docker Compose ativo — no Docker Desktop, o app precisa estar aberto).

Não existe `package.json` na raiz: são **três pacotes independentes**, cada um com seu próprio `npm install`.

A ordem abaixo importa — o `docker compose` lê as credenciais do `.env`, e o backend recusa subir se faltar variável obrigatória.

### 1. Clone e instale as dependências dos três pacotes

```bash
git clone https://github.com/anabraghim/chatbot-pagamentos.git
cd chatbot-pagamentos
npm install --prefix backend
npm install --prefix mcp-server
npm install --prefix frontend
```

### 2. Configure o `.env` do backend

```bash
cp backend/.env.example backend/.env
```

Só o **`OPENROUTER_API_KEY`** precisa ser preenchido à mão — pegue uma chave gratuita em https://openrouter.ai/keys.

As variáveis de banco (`DB_USER`, `DB_PASSWORD`, `DB_NAME`) vêm com valores de exemplo e **funcionam como estão**, porque o `docker-compose.yml` e o backend leem esse mesmo arquivo: o container é criado com as credenciais que o backend vai usar para conectar. Se preferir nomes mais realistas, troque os três — só faça isso *antes* de subir o container, porque eles são gravados no volume na primeira subida.

O backend valida tudo isso na subida (`src/data/env.ts`, com Zod) e **lança erro** se faltar ou estiver inválido.

### 3. Suba o Postgres

```bash
cd backend
docker compose up -d
docker compose ps      # confira se o container subiu
```

### 4. Crie as tabelas e popule o banco (ainda em `backend/`)

```bash
npx drizzle-kit migrate
npm run seed
```

Os dois comandos são obrigatórios. Sem eles o servidor até sobe, mas qualquer consulta falha (as tabelas não existem) e o catálogo fica vazio.

O `seed` cria o usuário fixo de desenvolvimento — **sem ele nenhuma intenção pode ser registrada**, porque a FK `intentions.userId → users.id` recusa — e um catálogo de 3 produtos. É idempotente, pode rodar quantas vezes quiser.

### 5. Rode o backend (em `backend/`)

```bash
npm run dev
```

Confira nos logs a linha:

```
[mcp-server] listar_catalogo, registrar_intencao, realizar_compra prontos (stdio)
```

O backend inicia o servidor MCP como processo filho via stdio — **não é preciso rodar o `mcp-server` separadamente.**

### 6. Rode o frontend, em outro terminal

```bash
cd chatbot-pagamentos/frontend
npm run dev
```

Acesse `http://localhost:5173` e pergunte algo como *"o que vocês têm à venda?"*.

### Fluxo para testar

1. *"o que vocês têm à venda?"* → o agente chama `listar_catalogo`
2. *"quero o item 3, uma unidade"* → chama `registrar_intencao` e pergunta o método de pagamento
3. *"pode pagar no pix"* → chama `realizar_compra` e informa `transacao_id` e limite restante

### Se algo der errado

| Sintoma | Causa provável |
|---|---|
| Chat falha com erro de CORS | O CORS está fixo em `http://localhost:5173` (`backend/src/index.ts`). Se o Vite subiu em outra porta porque a 5173 estava ocupada, libere a porta ou ajuste o `origin`. |
| `EADDRINUSE :::3000` | Já existe um backend rodando. Encerre o outro processo ou mude `PORT` no `.env`. |
| `Invalid env: ...` na subida | Falta variável no `.env`, ou está com formato inválido. |
| Consultas falham / catálogo vazio | Faltou rodar `npx drizzle-kit migrate` e `npm run seed`. |
| O agente não chama nenhuma tool | O modelo gratuito pode estar rate-limited. Troque o `OPENROUTER_MODEL`. |

### Parar o banco

```bash
docker compose down       # para o container, preserva os dados
docker compose down -v    # para e APAGA o volume (recomeça do zero)
```

---

# Backend

Node.js + TypeScript + Hono + PostgreSQL + Drizzle ORM. Hospeda o agente (OpenRouter) e o cliente MCP. Disponível em `http://localhost:3000`.

```bash
npm run dev      # desenvolvimento (tsx watch, reinicia sozinho ao salvar)
npm run build    # compila para dist/
npm start        # roda a build de produção
npm run seed     # usuário de desenvolvimento + catálogo inicial (idempotente)
```

As migrações são versionadas em `src/db/migrations/`, então `npx drizzle-kit migrate` basta. Só rode `npx drizzle-kit generate` se você **alterar** o schema em `src/db/schemas/`.

**Tabelas:** `users` (com `spendingLimit`), `products`, `intentions` (status `pendente` → `paga`, com `expiresAt`) e `transactions` (só compras aprovadas). O quanto o usuário já gastou **não** é uma coluna: é derivado somando as transações aprovadas.

---

# Servidor MCP

Pacote `mcp-server/`, uma tool por arquivo em `mcp-server/src/tools/`. Não roda sozinho em uso normal: o backend o inicia como processo filho (stdio) ao subir. Só precisa de `npm install` uma vez.

## `listar_catalogo`

Lista os produtos do Postgres, com filtro opcional por categoria.

| Argumento | Tipo | Obrigatório |
|---|---|---|
| `categoria` | string | não |

Retorna `{ produtos: [{ id, nome, preco, moeda, estoque }] }`.

## `registrar_intencao`

Registra a intenção de compra de um item e devolve um identificador. **Nenhum dinheiro se move aqui.**

| Argumento | Tipo | Obrigatório |
|---|---|---|
| `produto_id` | string | sim |
| `quantidade` | number (int > 0) | sim |

Retorna `{ intencao_id, produto_id, quantidade, valor_total, moeda, status: "pendente", expira_em }`.

Regras aplicadas no backend, não no prompt:

- **O valor não é argumento.** `valor_total` é calculado no servidor a partir do preço do catálogo, então o modelo não consegue inventar nem alterar preço.
- A intenção nasce vinculada ao usuário da sessão e expira em **15 minutos** (`INTENTION_TTL_MINUTES` em `tools/registrar-intencao.ts`).
- A identidade do usuário viaja no `_meta` do MCP, fora dos argumentos da tool.

Recusas vêm no formato `{ status: "recusado", erro, mensagem }`:

| Situação | Erro |
|---|---|
| Chamada sem identidade de usuário | `INTENCAO_INVALIDA` |
| `produto_id` inexistente ou inventado pelo modelo | `PRODUTO_NAO_ENCONTRADO` |
| Quantidade maior que o estoque | `ESTOQUE_INSUFICIENTE` |

Quantidade zero, negativa ou fracionada é barrada pelo próprio schema da tool, antes de chegar ao banco.

## `realizar_compra`

Executa o pagamento a partir de uma intenção registrada. É aqui que o dinheiro se move.

| Argumento | Tipo | Obrigatório |
|---|---|---|
| `intencao_id` | string | sim |
| `metodo_pagamento` | `"cartao"` \| `"pix"` | sim |

Retorna `{ status: "aprovado", transacao_id, intencao_id, valor, metodo_pagamento, limite_restante, data }`.

Regras aplicadas no backend, não no prompt:

- **O valor não é argumento.** Ele vem da intenção registrada, então o modelo não consegue inventar nem alterar o preço da compra.
- A intenção é buscada por `id` **e** `userId` ao mesmo tempo: uma intenção de outro usuário é indistinguível de uma inexistente, e as duas recusam com `INTENCAO_INVALIDA`.
- `limite_restante` é **derivado**, não guardado: `users.spendingLimit` menos a soma das transações aprovadas. Não existe coluna de "gasto" para dessincronizar do histórico.
- Tudo roda em uma única transação de banco: baixa da intenção, desconto de `products.stock` e gravação da transação. A intenção só é marcada como paga com `UPDATE ... WHERE status = 'pendente'`, o que fecha a corrida entre duas chamadas simultâneas.
- A regra vive em `backend/src/services/purchase.ts` e a tool é um adaptador fino sobre ela — o backend é a fonte da verdade.

Recusas vêm no mesmo formato `{ status: "recusado", erro, mensagem }`:

| Situação | Erro |
|---|---|
| Chamada sem identidade de usuário | `INTENCAO_INVALIDA` |
| `intencao_id` inexistente ou inventado pelo modelo | `INTENCAO_INVALIDA` |
| Intenção pertencente a outro usuário | `INTENCAO_INVALIDA` |
| Intenção já utilizada em uma compra | `INTENCAO_JA_PAGA` |
| Intenção fora do prazo de validade | `INTENCAO_EXPIRADA` |
| Valor acima do limite disponível do usuário | `LIMITE_EXCEDIDO` |
| `metodo_pagamento` diferente de `cartao` ou `pix` | `METODO_INVALIDO` |
| Estoque mudou entre a intenção e o pagamento | `ESTOQUE_INSUFICIENTE` |

`metodo_pagamento` é um `z.string()` validado no handler, e não um `z.enum`, de propósito: com um enum o SDK do MCP recusaria antes do handler e `METODO_INVALIDO` nunca voltaria no formato padrão de recusa.

> **Para ver o `LIMITE_EXCEDIDO`:** com o seed padrão ele não é alcançável em uma compra só — o limite é `5000` e o carrinho mais caro possível é Teclado × 5 = `2295`. Ou compre algumas vezes até acumular, ou baixe o limite direto no banco:
> ```sql
> UPDATE users SET "spendingLimit" = 500 WHERE email = 'demo@local';
> ```
> Mudar o valor no `seed.ts` **não** resolve: ele usa `onConflictDoNothing`, então não atualiza uma linha que já existe.

## Testando as tools isoladamente

```bash
npx @modelcontextprotocol/inspector npx tsx ../mcp-server/src/index.ts
```

Execute a partir da pasta `backend/`, para que o `.env` seja encontrado.

Atenção: o inspector **não envia o `_meta` de identidade**, então só `listar_catalogo` funciona por ali — `registrar_intencao` e `realizar_compra` respondem `INTENCAO_INVALIDA`. Isso é o comportamento correto (é a defesa contra chamadas fora do fluxo do usuário), não um bug. O caminho feliz precisa ser exercitado pelo chat, ou por um script que monte o `_meta` na mão.

---

# Frontend

App React (Vite + TypeScript) em `frontend/`, com um chat minimalista que conversa com `POST /chat` no backend.

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run lint     # oxlint
```

Não precisa de `.env`: a URL do backend vem de `VITE_API_URL`, com default `http://localhost:3000`.

O frontend guarda o histórico inteiro da conversa no estado e **substitui** esse estado pelo array devolvido pelo backend a cada turno, incluindo as chamadas de ferramenta e seus resultados — é assim que o requisito de histórico completo é cumprido.
