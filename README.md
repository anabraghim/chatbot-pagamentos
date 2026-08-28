Readme em construção, por enquanto só com as informações de como rodar o backend localmente.

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

Seguindo o template [.env.example](backend/.env.example)

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
