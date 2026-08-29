// Chave do `_meta` do MCP usada para levar a identidade do usuário até as tools.
//
// A identidade viaja fora dos argumentos da tool de propósito: assim ela não aparece
// no inputSchema, o modelo nunca a vê e não consegue forjá-la. O backend preenche
// esse campo em toda chamada e o servidor MCP lê de `extra._meta`.
export const USER_ID_META_KEY = "payment-agent/userId"
