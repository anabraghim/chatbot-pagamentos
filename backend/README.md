# Backend

API em Node.js + TypeScript + Hono + PostgreSQL + Drizzle ORM. Hospeda a autenticação, o loop do agente (OpenRouter) e o cliente MCP. Roda em <http://localhost:3000>.

> **Setup completo (env, banco, seed) está no [README da raiz](../README.md).** Os comandos abaixo pressupõem que ele já foi seguido.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (`tsx watch`), reinicia ao salvar. |
| `npm run build` | Compila TypeScript para `dist/`. |
| `npm start` | Roda a build de produção. |
| `npm run seed` | Cria o usuário demo (`demo@local` / `demo1234`) e o catálogo inicial. Idempotente. |

## Banco de dados

As migrações são versionadas em `src/db/migrations/`, então `npx drizzle-kit migrate` basta para criar as tabelas. Só rode `npx drizzle-kit generate` se você **alterar** o schema em `src/db/schemas/`.

## Servidor MCP

O backend inicia o [`mcp-server`](../mcp-server/) como processo filho via stdio ao subir — não é preciso rodá-lo separadamente.
