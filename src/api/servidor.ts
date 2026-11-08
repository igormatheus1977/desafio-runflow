import Fastify from "fastify";
import { produtos, pedidos, gerarIdPedido, type ItemPedido } from "./dados.js";

const app = Fastify();
app.get("/products", async () => produtos);

app.get<{ Params: { id: string } }>("/products/:id", async (req, reply) => {
  const id = Number(req.params.id);
  const produto = produtos.find((p) => p.id === id);
  if (!produto) return reply.code(404).send({ erro: `Produto ${req.params.id} não encontrado.` });
  return produto;
});

app.get<{ Params: { id: string } }>("/orders/:id", async (req, reply) => {
  const id = Number(req.params.id);
  const pedido = pedidos.find((p) => p.id === id);
  if (!pedido) return reply.code(404).send({ erro: `Pedido ${req.params.id} não encontrado.` });
  return pedido;
});

// Corpo esperado: [{ produtoId, quantidade }, ...]
app.post("/orders", async (req, reply) => {
  const corpo = req.body;

  // 1) Formato: lista não vazia, com números inteiros e quantidade maior que zero.
  const formatoValido =
    Array.isArray(corpo) &&
    corpo.length > 0 &&
    corpo.every(
      (i) =>
        i &&
        Number.isInteger(i.produtoId) &&
        Number.isInteger(i.quantidade) &&
        i.quantidade > 0,
    );
  if (!formatoValido) {
    return reply
      .code(400)
      .send({ erro: "Envie uma lista não vazia de itens: [{ produtoId, quantidade }], com quantidade inteira maior que zero." });
  }
  const pedidoItens = corpo as { produtoId: number; quantidade: number }[];

  // Se o mesmo produto aparecer duas vezes, soma as quantidades antes de conferir o estoque.
  const porProduto = new Map<number, number>();
  for (const { produtoId, quantidade } of pedidoItens) {
    porProduto.set(produtoId, (porProduto.get(produtoId) ?? 0) + quantidade);
  }

  // 2) Valida TODOS os itens (existência e estoque) antes de alterar qualquer coisa.
  const itens: ItemPedido[] = [];
  for (const [produtoId, quantidade] of porProduto) {
    const produto = produtos.find((p) => p.id === produtoId);
    if (!produto) return reply.code(404).send({ erro: `Produto ${produtoId} não encontrado.` });
    if (produto.estoque < quantidade) {
      return reply.code(400).send({
        erro: `Estoque insuficiente para "${produto.nome}": pedido de ${quantidade}, disponível ${produto.estoque}.`,
      });
    }
    itens.push({ produtoId, nome: produto.nome, quantidade, precoUnitario: produto.preco });
  }

  // 3) Tudo certo: agora sim desconta o estoque e cria o pedido.
  for (const item of itens) {
    produtos.find((p) => p.id === item.produtoId)!.estoque -= item.quantidade;
  }
  const total = itens.reduce((soma, i) => soma + i.quantidade * i.precoUnitario, 0);
  const pedido = { id: gerarIdPedido(), status: "em_processamento" as const, itens, total };
  pedidos.push(pedido);
  return reply.code(201).send(pedido);
});

const porta = Number(process.env.API_PORT) || 3000;
await app.listen({ port: porta, host: "127.0.0.1" });
console.log(`API da loja no ar em http://127.0.0.1:${porta}`);