Readme em construção. Estado atual: primeira fatia end-to-end do chatbot — chat (frontend React) → backend (agente + cliente MCP) → servidor MCP com a tool `listar_catalogo`, lendo os produtos direto do Postgres. Ainda sem autenticação, `registrar_intencao` ou `realizar_compra`.

**Modelo usado:** [OpenRouter](https://openrouter.ai/) com o modelo gratuito `minimax/minimax-m3:free` (configurável via `OPENROUTER_MODEL` em `backend/.env`, caso o modelo padrão fique indisponível/rate-limited — modelos gratuitos na OpenRouter mudam de disponibilidade com frequência).

## Rodando o projeto completo

1. Suba o Postgres e o backend (instruções detalhadas na seção [Backend](#backend) abaixo). O backend, ao subir, também inicia o servidor MCP (`mcp-server/`) como um processo filho via stdio — não é preciso rodar o `mcp-server` separadamente.
2. Instale as dependências do `mcp-server`:
   ```bash
   cd mcp-server
   npm install
   ```
3. Configure `backend/.env` (a partir de `backend/.env.example`) com sua chave da OpenRouter em `OPENROUTER_API_KEY` (crie uma gratuita em https://openrouter.ai/keys).
4. Rode o backend (`npm run dev` dentro de `backend/`) — confira nos logs a mensagem `[mcp-server] listar_catalogo pronto (stdio)`.
5. Rode o frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Acesse `http://localhost:5173` e pergunte algo como "o que vocês têm à venda?".

# Backend

Backend da aplicação desenvolvido com **Node.js, TypeScript, Hono, PostgreSQL e Drizzle ORM**.

## Pré-requisitos

* Node.js
* Docker ou Docker Compose

## Instalação

Clone o projeto e entre na pasta do backend:

```bash
git clone https://github.com/anabraghim/chatbot-pagamentos.git
cd backend
```

Instale as dependências:

```bash
npm install
```

## Variáveis de ambiente

Crie um arquivo `.env` na raiz do backend:

Seguindo o template [.env.example](backend/.env.example). Inclui as variáveis do Postgres e `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`, usadas pelo agente de chat.

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
```

## Parar o banco

Quando terminar:

```bash
docker compose down
```

# Servidor MCP

Pacote `mcp-server/`, com a tool `listar_catalogo` (lista produtos do Postgres, com filtro opcional por categoria). Não roda sozinho em uso normal: o backend o inicia automaticamente como processo filho (stdio) ao subir. Só precisa rodar `npm install` dentro de `mcp-server/` uma vez.

Para testar a tool isoladamente, sem passar pelo LLM:

```bash
npx @modelcontextprotocol/inspector npx tsx mcp-server/src/index.ts
```

Execute a partir da pasta `backend/`, para que o `.env` seja encontrado.

# Frontend

App React (Vite + TypeScript) em `frontend/`, com um chat minimalista que conversa com `POST /chat` no backend.

```bash
cd frontend
npm install
npm run dev
```

Disponível em `http://localhost:5173`.
