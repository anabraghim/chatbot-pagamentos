Readme em construção. Estado atual: chat (frontend React) → backend (agente + cliente MCP) → servidor MCP com as tools `listar_catalogo` e `registrar_intencao`, lendo e gravando direto no Postgres. Ainda sem autenticação (existe um usuário demo fixo no lugar) e sem `realizar_compra`.

**Modelo usado:** [OpenRouter](https://openrouter.ai/) com o modelo gratuito `minimax/minimax-m3:free` (configurável via `OPENROUTER_MODEL` em `backend/.env`, caso o modelo padrão fique indisponível/rate-limited — modelos gratuitos na OpenRouter mudam de disponibilidade com frequência).

## Rodando o projeto completo

Pré-requisitos: **Node.js 20+** e **Docker** (com Docker Compose). Não existe `package.json` na raiz — são três pacotes independentes, cada um com seu próprio `npm install`.

A ordem abaixo importa: o `docker compose` lê as credenciais do `.env`, e o backend recusa subir se faltar variável obrigatória.

**1. Clone e instale as dependências dos três pacotes**

```bash
git clone https://github.com/anabraghim/chatbot-pagamentos.git
cd chatbot-pagamentos
npm install --prefix backend
npm install --prefix mcp-server
npm install --prefix frontend
```

**2. Configure o `.env` do backend**

```bash
cp backend/.env.example backend/.env
```

Preencha `OPENROUTER_API_KEY` com uma chave gratuita de https://openrouter.ai/keys. Os demais valores do template já funcionam como estão. O backend valida essas variáveis na subida (`src/data/env.ts`) e **lança erro** se alguma faltar.

**3. Suba o Postgres**

```bash
cd backend
docker compose up -d
docker compose ps      # confira se o container subiu
```

**4. Crie as tabelas e popule o banco** (ainda em `backend/`)

```bash
npx drizzle-kit migrate
npm run seed
```

O `seed` cria o usuário demo — sem ele nenhuma intenção pode ser registrada — e um catálogo inicial de 3 produtos. É idempotente, pode rodar quantas vezes quiser.

**5. Rode o backend** (em `backend/`)

```bash
npm run dev
```

Confira nos logs a mensagem `[mcp-server] listar_catalogo, registrar_intencao prontos (stdio)`. O backend inicia o servidor MCP (`mcp-server/`) como processo filho via stdio — não é preciso rodar o `mcp-server` separadamente.

**6. Rode o frontend**, em outro terminal

```bash
cd chatbot-pagamentos/frontend
npm run dev
```

Acesse `http://localhost:5173` e pergunte algo como "o que vocês têm à venda?".

> O CORS do backend está fixo em `http://localhost:5173` (`backend/src/index.ts`). Se o Vite subir em outra porta porque a 5173 estava ocupada, o chat falha — libere a porta ou ajuste o `origin`.

# Backend

Backend da aplicação desenvolvido com **Node.js, TypeScript, Hono, PostgreSQL e Drizzle ORM**.

## Pré-requisitos

* Node.js 20+
* Docker ou Docker Compose

## Instalação

Clone o projeto e entre na pasta do backend:

```bash
git clone https://github.com/anabraghim/chatbot-pagamentos.git
cd chatbot-pagamentos/backend
```

Instale as dependências:

```bash
npm install
```

## Variáveis de ambiente

Crie o `.env` a partir do template [.env.example](backend/.env.example):

```bash
cp .env.example .env
```

Inclui as variáveis do Postgres, `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` (usadas pelo agente de chat) e `DEMO_USER_ID`, o usuário fixo que faz o papel do usuário logado enquanto não existe autenticação. Só `OPENROUTER_API_KEY` precisa ser preenchida à mão.

Esse passo vem **antes** de subir o banco: o `docker-compose.yml` lê `${DB_USER}`, `${DB_PASSWORD}`, `${DB_NAME}` e as portas desse mesmo `.env`.

## Banco de dados

OBS: Se estiver usando Docker Compose, você precisa deixar o aplicativo aberto para a próxima etapa.

Suba o PostgreSQL com Docker:

```bash
docker compose up -d
```

Verifique se o container está rodando:

```bash
docker compose ps
```

Crie as tabelas e popule os dados iniciais:

```bash
npx drizzle-kit migrate
npm run seed
```

As migrações são versionadas em `src/db/migrations/`, então `migrate` basta — só rode `npx drizzle-kit generate` se você alterar o schema em `src/db/schemas/`. Sem esses dois comandos o servidor até sobe, mas qualquer consulta falha (as tabelas não existem) e o catálogo fica vazio.

## Rodando o backend

Inicie o servidor em modo desenvolvimento:

```bash
npm run dev
```

O backend estará disponível em:

```text
http://localhost:3000
```

O servidor utiliza `tsx watch`, então será reiniciado automaticamente sempre que houver alterações no código.

## Comandos

```bash
npm run dev      # desenvolvimento
npm run build    # build
npm start        # produção
npm run seed     # cria o usuário demo e o catálogo inicial (idempotente)
```

## Parar o banco

Quando terminar:

```bash
docker compose down
```

# Servidor MCP

Pacote `mcp-server/`, uma tool por arquivo em `mcp-server/src/tools/`. Não roda sozinho em uso normal: o backend o inicia automaticamente como processo filho (stdio) ao subir. Só precisa rodar `npm install` dentro de `mcp-server/` uma vez.

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
- A identidade do usuário viaja no `_meta` do MCP, fora dos argumentos da tool — assim ela não aparece no `inputSchema`, o modelo não a vê e não consegue forjá-la.

Recusas vêm no formato `{ status: "recusado", erro, mensagem }`:

| Situação | Erro |
|---|---|
| Chamada sem identidade de usuário | `INTENCAO_INVALIDA` |
| `produto_id` inexistente ou inventado pelo modelo | `PRODUTO_NAO_ENCONTRADO` |
| Quantidade maior que o estoque | `ESTOQUE_INSUFICIENTE` |

Quantidade zero, negativa ou fracionada é barrada pelo próprio schema da tool, antes de chegar ao banco.

## Testando as tools isoladamente

```bash
npx @modelcontextprotocol/inspector npx tsx ../mcp-server/src/index.ts
```

Execute a partir da pasta `backend/`, para que o `.env` seja encontrado. Atenção: o inspector não envia o `_meta` de identidade, então `registrar_intencao` responde `INTENCAO_INVALIDA` — o caminho feliz precisa ser exercitado pelo chat.

# Frontend

App React (Vite + TypeScript) em `frontend/`, com um chat minimalista que conversa com `POST /chat` no backend.

```bash
cd frontend
npm install
npm run dev
```

Disponível em `http://localhost:5173`. Não precisa de `.env`: a URL do backend vem de `VITE_API_URL`, com default `http://localhost:3000`.

O frontend guarda o histórico inteiro da conversa no estado e reenvia tudo a cada turno, incluindo as chamadas de ferramenta e seus resultados — é assim que o requisito de histórico completo é cumprido.
