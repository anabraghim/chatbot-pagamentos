import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod"

type Produto = {
    id: string;
    nome: string;
    preco: number;
    moeda: string;
    estoque: number;
    categoria: string;
}

const produtos: Produto[] = [
    {
        id: "001",
        nome: "Notebook",
        preco: 3500,
        moeda: "BRL",
        estoque: 10,
        categoria: "Informática",
    },
    {
        id: "002",
        nome: "Mouse sem fio",
        preco: 120,
        moeda: "BRL",
        estoque: 25,
        categoria: "Periféricos"
    },
    {
        id: "003",
        nome: "Teclado mecânico",
        preco: 450,
        moeda: "BRL",
        estoque: 15,
        categoria: "Periféricos"
    },
    {
        id: "004",
        nome: "Monitor 24 polegadas",
        preco: 900,
        moeda: "BRL",
        estoque: 8,
        categoria: "Informática"
    },
    {
        id: "005",
        nome: "Headset",
        preco: 280,
        moeda: "BRL",
        estoque: 20,
        categoria: "Áudio"
    },
];
const server = new McpServer({
    name: "payment",
    version: "1.0.0"
});

const produtoSchema = {
    id: z.string(),
    nome: z.string(),
    preco: z.number(),
    moeda: z.string(),
    estoque: z.number(),
    categoria: z.string()
}

const outputSchema = {
    produtos: z.array(z.object(produtoSchema))
}

//register reather tools (manipulador de execução de ferramentas)
//responsável por executar a lógica de cada tool

server.registerTool(
    "listar_catalogo",
    {
        description: "Lista os produtos disponíveis no catálogo",
        inputSchema: {
            categoria: z.string().optional().describe("Filtro opcional por categoria")
        },
        outputSchema
    },
    async ({ categoria }) => {

        const produtosFiltrados = categoria ? 
        produtos.filter(
            (produto) => produto.categoria.toLowerCase() === categoria.toLowerCase()
        )
        : produtos

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        produtos: produtosFiltrados
                    })
                }
                ],
            structuredContent: {
                produtos: produtosFiltrados
            }
                }
    }
)