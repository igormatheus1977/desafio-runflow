// Dados em memória da loja. Reiniciar o servidor volta tudo a este estado.

export interface Produto {
  id: number;
  nome: string;
  preco: number;
  estoque: number;
}

export interface ItemPedido {
  produtoId: number;
  nome: string;
  quantidade: number;
  precoUnitario: number;
}

export type StatusPedido = "em_processamento" | "enviado" | "entregue";

export interface Pedido {
  id: number;
  status: StatusPedido;
  itens: ItemPedido[];
  total: number;
}

// O iPhone 18 está sem estoque de propósito, para exercitar os testes de erro e de filtro.
export const produtos: Produto[] = [
  { id: 1, nome: "iPhone 13", preco: 4000, estoque: 67 },
  { id: 2, nome: "iPhone 14", preco: 5000, estoque: 22 },
  { id: 3, nome: "iPhone 15", preco: 6000, estoque: 45 },
  { id: 4, nome: "iPhone 16", preco: 8000, estoque: 17 },
  { id: 5, nome: "iPhone 17", preco: 10000, estoque: 17 },
  { id: 6, nome: "iPhone 18", preco: 12500, estoque: 0 },
];

export const pedidos: Pedido[] = [
  {
    id: 1040,
    status: "entregue",
    itens: [
      { produtoId: 2, nome: "iPhone 14", quantidade: 1, precoUnitario: 5000 },
      { produtoId: 5, nome: "iPhone 17", quantidade: 1, precoUnitario: 10000 },
    ],
    total: 15000,
  },
  {
    id: 1041,
    status: "em_processamento",
    itens: [{ produtoId: 4, nome: "iPhone 16", quantidade: 1, precoUnitario: 8000 }],
    total: 8000,
  },
  {
    id: 1042,
    status: "enviado",
    itens: [
      { produtoId: 3, nome: "iPhone 15", quantidade: 2, precoUnitario: 6000 },
      { produtoId: 2, nome: "iPhone 14", quantidade: 1, precoUnitario: 5000 },
    ],
    total: 17000,
  },
];

// Os pedidos novos começam em 1001; os de exemplo (1040 a 1042) são dados fixos de teste.
let proximoIdPedido = 1001;
export function gerarIdPedido(): number {
  return proximoIdPedido++;
}