# Frontend

Chat em React 19 + Vite + TypeScript, com login, cadastro e rota protegida. Roda em <http://localhost:5173> e conversa com o backend em `POST /chat`.

> **Setup completo está no [README da raiz](../README.md).** O backend precisa estar rodando para o chat funcionar.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento do Vite. |
| `npm run build` | Type-check + build de produção. |
| `npm run preview` | Serve a build localmente. |
| `npm run lint` | oxlint. |

## Configuração

Não precisa de `.env`: a URL do backend vem de `VITE_API_URL`, com default `http://localhost:3000`.

## Organização

- `src/lib/auth.tsx` — `AuthProvider`, `useAuth` e `ProtectedRoute`. O token JWT fica em `localStorage`.
- `src/lib/api.ts` — chamadas ao backend; um `401` vira `UnauthorizedError` e dispara logout automático.
- `src/pages/` — `LoginPage`, `RegisterPage` e `ChatPage`.

O `ChatPage` guarda o histórico inteiro da conversa no estado e o **substitui** pelo array devolvido pelo backend a cada turno, incluindo as chamadas de ferramenta e seus resultados — é assim que o requisito de histórico completo é cumprido. Ao criar uma tool nova, acrescente a legenda dela em `TOOL_LABELS`.
