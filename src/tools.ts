import { Type, type FunctionDeclaration } from "@google/genai";

// Endereço da API da loja (a mesma porta do servidor, vinda do .env).
const urlBase = `http://127.0.0.1:${process.env.API_PORT || 3000}`;

// ---------------------------------------------------------------------------
// 1) O que o Gemini enxerga: nome, descrição e parâmetros de cada tool.
//    A descrição é o que ele lê para decidir QUANDO usar cada uma.
// ---------------------------------------------------------------------------
export const declaracoes: FunctionDeclaration[] = [
  {
    name: "list_products",
    description:
      "Lista todos os produtos com id, nome, preço e estoque. Use para perguntas gerais sobre o catálogo.",
  },
  {
    name: "get_product",
    description: "Detalhes de um produto pelo id.",
    parameters: {
      type: Type.OBJECT,
      properties: { id: { type: Type.INTEGER, description: "Id do produto." } },
      required: ["id"],
    },
  },
  {
    name: "get_order_status",
    description: "Status, itens e total de um pedido pelo id.",
    parameters: {
      type: Type.OBJECT,
      properties: { id: { type: Type.INTEGER, description: "Id do pedido." } },
      required: ["id"],
    },
  },
  {
    name: "create_order",
    description:
      "Cria um pedido novo. Só use quando produtos e quantidades estiverem claros. Pedidos não podem ser editados nem cancelados.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        itens: {
          type: Type.ARRAY,
          description: "Lista de itens do pedido.",
          items: {
            type: Type.OBJECT,
            properties: {
              produtoId: { type: Type.INTEGER, description: "Id do produto." },
              quantidade: { type: Type.INTEGER, description: "Quantidade de unidades." },
            },
            required: ["produtoId", "quantidade"],
          },
        },
      },
      required: ["itens"],
    },
  },
];

// ---------------------------------------------------------------------------
// 2) Quem executa de verdade: o nosso código faz o fetch na API da loja.
//    Nenhuma tool lança exceção: se algo falha, devolve { erro: "mensagem" }.
// ---------------------------------------------------------------------------
type Args = Record<string, unknown>;

async function chamarApi(caminho: string, opcoes?: RequestInit): Promise<unknown> {
  try {
    const resposta = await fetch(urlBase + caminho, opcoes);
    const dados = await resposta.json();
    if (!resposta.ok) return { erro: dados?.erro ?? `A API da loja respondeu com status ${resposta.status}.` };
    return dados;
  } catch {
    return { erro: "Não consegui falar com a API da loja. Ela está no ar?" };
  }
}

const inteiroPositivo = (x: unknown): x is number => Number.isInteger(x) && (x as number) > 0;

const executores: Record<string, (args: Args) => Promise<unknown>> = {
  // A API devolve uma lista; o Gemini espera um objeto como resposta, então embrulhamos.
  list_products: async () => {
    const dados = await chamarApi("/products");
    return Array.isArray(dados) ? { produtos: dados } : dados;
  },

  get_product: async (args) => {
    if (!inteiroPositivo(args.id)) return { erro: "O id do produto precisa ser um número inteiro positivo." };
    return chamarApi(`/products/${args.id}`);
  },

  get_order_status: async (args) => {
    if (!inteiroPositivo(args.id)) return { erro: "O id do pedido precisa ser um número inteiro positivo." };
    return chamarApi(`/orders/${args.id}`);
  },

  create_order: async (args) => {
    const itens = args.itens;
    const itensValidos =
      Array.isArray(itens) &&
      itens.length > 0 &&
      itens.every((i) => i && inteiroPositivo(i.produtoId) && inteiroPositivo(i.quantidade));
    if (!itensValidos) {
      return { erro: "Informe ao menos um item, cada um com produtoId e quantidade inteiros e maiores que zero." };
    }
    return chamarApi("/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(itens),
    });
  },
};

// O agente chama só esta função: ela escolhe o executor certo pelo nome que o Gemini pediu.
export async function executarTool(nome: string, args: Args = {}): Promise<unknown> {
  const executor = executores[nome];
  if (!executor) return { erro: `Tool desconhecida: ${nome}.` };
  try {
    return await executor(args);
  } catch {
    return { erro: "Erro inesperado ao executar a tool." };
  }
}