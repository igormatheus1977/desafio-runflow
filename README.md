# Agente de atendimento para loja de iPhones

Este projeto é um agente de atendimento para uma loja online de iPhones. Você conversa com ele no terminal, e ele consulta produtos, consulta pedidos e cria pedidos. Para isso, o Gemini decide o que precisa ser consultado, e o meu código faz a chamada a uma API mock da loja (uma simulação de API, com os dados em memória).

## Como rodar

**Você vai precisar de:** Node.js 20.6 ou mais novo e uma chave do Gemini, criada em [aistudio.google.com](https://aistudio.google.com).

**1. Instale as dependências:**

```bash
npm install
```

**2. Crie o arquivo `.env` a partir do exemplo:**

```bash
cp .env.example .env
```

**3. Abra o `.env` e preencha as variáveis.** Só a chave é obrigatória:

| Variável          | Para que serve                                                                          |
| ------------------ | --------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY` | Sua chave do Gemini (obrigatória)                                                      |
| `GEMINI_MODEL`   | Modelo utilizado.                                                                       |
| `API_PORT`       | Porta da API da loja. Se ficar vazio, usa `3000`<br />(Padrão no Node.js/Typescript) |

**4. Ligue a API da loja em um terminal:**

```bash
npm run api
```

**5. Abra o chat em um segundo terminal:**

```bash
npm run chat
```

Digite sua mensagem e aperte Enter. Para encerrar, digite `sair`.

**Para rodar os testes de aceite**, ou seja, os testes do enunciado do desafio (usa o Gemini de verdade e liga sozinho uma API própria na porta 3100, então não precisa do passo 4):

```bash
npm run aceite
```

**Para checar os tipos do TypeScript** (verifica os arquivos typescript, por exemplo, a soma de uma string com um numero: "7000" + 7000 = 70007000, o que é absurdo)

```bash
npm run typecheck
```

## Como funciona

```
Você (terminal) → chat.ts → agente.ts ⇄ Gemini
                               ↓ o Gemini PEDE uma tool; o código executa
                           tools.ts → fetch → API da loja (Fastify) → JSON
```

O ponto principal é que **o Gemini não acessa a loja**. Ele só chama uma tool. A cada mensagem, o agente faz o seguinte:

1. Coloca a mensagem no histórico e envia ao Gemini o histórico inteiro, a system prompt e a lista de tools.
2. Se o Gemini pedir uma tool, o código executa, guarda o pedido e o resultado no histórico e chama o Gemini de novo.
3. Se o Gemini responder com texto, esse texto vai para você e o loop termina.

Esse loop tem um limite de 6 voltas por mensagem, para não ocorrer um loop infinito.

```
src/
  api/dados.ts          produtos e pedidos em memória
  api/servidor.ts       os 4 endpoints (Fastify)
  tools.ts              as 4 tools: descrição para o Gemini + função que chama a API
  prompt.ts             a system prompt
  agente.ts             o loop de tool calling e o histórico
  chat.ts               o chat no terminal
scripts/aceite.ts       roda os 6 fluxos e confere as respostas
docs/transcricoes.md    a saída gerada pelo script
```

**Dados de teste:** a loja já começa com 6 iPhones e **3 pedidos prontos: 1040, 1041 e 1042**. Eles existem só para testar a consulta de pedidos, e nenhum cliente os criou (são os testes do enunciado). Mas, os pedidos que o cliente cria começam em **1001**.

| Pedido de teste | Status           | Itens                      | Total     |
| --------------- | ---------------- | -------------------------- | --------- |
| 1040            | entregue         | 1x iPhone 14, 1x iPhone 17 | R$ 15.000 |
| 1041            | em_processamento | 1x iPhone 16               | R$ 8.000  |
| 1042            | enviado          | 2x iPhone 15, 1x iPhone 14 | R$ 17.000 |

**Endpoints da API:** `GET /products`, `GET /products/:id`, `GET /orders/:id` e `POST /orders`.

**Tools:** `list_products`, `get_product`, `get_order_status` e `create_order`.

Distinções: o GET busca uma informação, e o POST cria alguma informação, o `create_order` buscará o prefixo POST para ele criar um arquivo, e o `list_products` chama o GET para buscar informações de produto

## Decisões técnicas e por quê

- **Loop escrito à mão, sem framework de agente.** São poucas linhas, e dá para ver exatamente o que acontece. Um framework esconderia muitas ferramentas.
- **Gemini:** foi escolhido o **`gemini-3.1-flash-lite`** porque o `gemini-2.5-flash` do enunciado deu erro 404, porque foi aposentado para contas novas. O `flash-lite` conseguiu rodar todos os testes. Ele também pede esperas por causa da cota: nas execuções recentes dos testes houve espera em todas, de até cerca de 1 minuto, e por isso existe a repetição automática. O nome do modelo fica em `GEMINI_MODEL`, então trocar não exige mudar o código.
- **SDK oficial `@google/genai`.** Melhor integração com o LLM Gemini.
- **Fastify no lugar de Express e Hono.** Qualquer um dos três serviria. Escolhi o Fastify porque ele já traz o que essa API usa: lê o JSON do `POST /orders` sem configuração extra e tem os tipos do TypeScript embutidos. O Express precisaria de `express.json()` e do pacote `@types/express`. O Hono é pensado para rodar em vários ambientes, e no Node precisaria de um adaptador, `@hono/node-server`. Dessa forma, o código fica com menos dependências.
- **Dados em memória.** Para uma API mock, um banco de dados seria exagero, e o próprio enunciado diz que não é necessário, a consequência disso é que ao reiniciar a API, o estoque e os pedidos voltam ao início.
- **A tool `POST /orders` valida todos os itens antes de alterar qualquer coisa.** Se um item falha, nada é descontado, e não fica um pedido pela metade.
- **Pedidos não podem ser editados.** Se o cliente pede para "adicionar" itens, o agente explica isso e pergunta se o cliente quer criar um novo pedido. Ao oferecer, ele precisa citar o produto e a quantidade. Depois do "sim", chama a tool `create_order`.
- **Pedidos novos começam em 1001, e os 3 de teste têm números fixos.** Separa o que o cliente criou do que veio pronto. O limite é que o 40º pedido criado na mesma sessão receberia o número 1040, repetindo um pedido de teste.
- **Poucos arquivos, com uma responsabilidade cada.** Fica fácil achar cada coisa e explicar o projeto.

## O que acontece quando algo dá errado

- **Produto ou pedido não existe:** a API responde 404, a tool devolve `{ erro }` e o agente avisa ao cliente, sem inventar.
- **Estoque insuficiente:** a API recusa o pedido inteiro (400) e nada é descontado.
- **Argumento inválido** (id que não é número, lista vazia, quantidade negativa): a própria tool recusa, antes de chamar a API.
- **API da loja fora do ar:** o chat avisa ao iniciar. Se ela cair durante a conversa, a tool devolve uma mensagem de erro clara.

## Testes de aceite (transcrição)

São os 6 fluxos do enunciado (13 mensagens, mais o "sim" de confirmação), numa única sessão com histórico e com a API recém-ligada. Esta é a saída real de `npm run aceite`, que também grava [docs/transcricoes.md](docs/transcricoes.md). A linha `[tool]` mostra a tool que o agente chamou.

O script não olha só o texto: ele também confere quais tools foram chamadas e, no final, pergunta à API como ficaram o estoque e os pedidos. O estoque de 65 no teste de 1000 unidades é o valor real naquele momento, porque o pedido 1001 já tinha descontado 2 unidades do iPhone 13 (67 - 2).

**Uma limitação:** o Gemini não responde igual toda vez, então uma nova execução pode sair diferente. Na última rodada, com o código final, os fluxos rodaram 3 vezes: 2 passaram inteiras e 1 foi reprovada. Na reprovada, o agente avisou que o iPhone 18 estava "esgotado", e o script exige as palavras "sem estoque". A transcrição abaixo é de uma execução aprovada. O script confere trechos do texto, então não avalia se a resposta está bem escrita.

```
**Resultado: 1 VERIFICAÇÃO(ÕES) FALHARAM**

## Fluxo 1. Listar produtos

**Pergunta:** Quais produtos vocês têm disponíveis?

**Tools:** `list_products({})`

**Resposta:**

Temos os seguintes modelos em estoque:

* **iPhone 13**: R$ 4.000,00
* **iPhone 14**: R$ 5.000,00
* **iPhone 15**: R$ 6.000,00
* **iPhone 16**: R$ 8.000,00
* **iPhone 17**: R$ 10.000,00

O **iPhone 18** está indisponível no momento.

**Resultado:** FALHOU: não avisou que o iPhone 18 está sem estoque

---

**Pergunta:** Me mostra só os que estão em estoque.

**Tools:** `nenhuma`

**Resposta:**

Estes são os modelos disponíveis em estoque:

* **iPhone 13**: R$ 4.000,00
* **iPhone 14**: R$ 5.000,00
* **iPhone 15**: R$ 6.000,00
* **iPhone 16**: R$ 8.000,00
* **iPhone 17**: R$ 10.000,00

**Resultado:** PASSOU

---


## Fluxo 2. Detalhes do produto

**Pergunta:** Me conta mais sobre o produto 3.

**Tools:** `get_product({"id":3})`

**Resposta:**

O iPhone 15 custa R$ 6.000,00 e temos 45 unidades disponíveis em estoque. Deseja realizar um pedido?

**Resultado:** PASSOU

---

**Pergunta:** E quanto custa o produto 2?

**Tools:** `get_product({"id":2})`

**Resposta:**

O iPhone 14 custa R$ 5.000,00 e temos 22 unidades em estoque. Gostaria de comprar?

**Resultado:** PASSOU

---


## Fluxo 3. Criar pedido

**Pergunta:** Quero 2 unidades do produto 1 e 1 unidade do produto 4

**Tools:** `create_order({"itens":[{"quantidade":2,"produtoId":1},{"produtoId":4,"quantidade":1}]})`

**Resposta:**

Pedido criado com sucesso!

Número do pedido: 1001
Total: R$ 16.000,00

**Resultado:** PASSOU

---

**Pergunta:** Adiciona 3 do último que você me mostrou

**Tools:** `nenhuma`

**Resposta:**

Como informei anteriormente, não é possível editar pedidos já realizados. Você deseja criar um novo pedido com 3 unidades do iPhone 16?

**Resultado:** PASSOU

---

**Pergunta:** sim

**Tools:** `create_order({"itens":[{"produtoId":4,"quantidade":3}]})`

**Resposta:**

Pedido criado com sucesso!

Número do pedido: 1002
Total: R$ 24.000,00

**Resultado:** PASSOU

---


## Fluxo 4. Consultar pedido

**Pergunta:** Qual o status do pedido 1042?

**Tools:** `get_order_status({"id":1042})`

**Resposta:**

O pedido 1042 está com status **enviado**.

Itens:
* 2 unidades de iPhone 15
* 1 unidade de iPhone 14

Total: R$ 17.000,00

**Resultado:** PASSOU

---

**Pergunta:** E o que eu pedi nele mesmo?

**Tools:** `nenhuma`

**Resposta:**

O pedido 1042 contém:

* 2 unidades de iPhone 15
* 1 unidade de iPhone 14

O valor total deste pedido é R$ 17.000,00.

**Resultado:** PASSOU

---


## Fluxo 5. Erros

**Pergunta:** Me fala do produto 999.

**Tools:** `get_product({"id":999})`

**Resposta:**

Infelizmente, o produto 999 não foi encontrado em nosso catálogo. Posso ajudar com mais alguma informação sobre os modelos que temos?

**Resultado:** PASSOU

---

**Pergunta:** Quero comprar 1000 unidades do produto 1.

**Tools:** `get_product({"id":1})`

**Resposta:**

Infelizmente, não temos essa quantidade em estoque. No momento, temos apenas 65 unidades do iPhone 13 disponíveis. Deseja realizar um pedido com uma quantidade menor?

**Resultado:** PASSOU

---

**Pergunta:** Qual o status do pedido 9999?

**Tools:** `get_order_status({"id":9999})`

**Resposta:**

Infelizmente, o pedido 9999 não foi encontrado. Posso ajudar com algo mais?

**Resultado:** PASSOU

---


## Fluxo 6. Limites

**Pergunta:** Qual a previsão do tempo em SP?

**Tools:** `nenhuma`

**Resposta:**

Sinto muito, mas não posso te ajudar com isso, pois trato apenas de assuntos relacionados aos produtos e pedidos desta loja. Posso verificar algo sobre os iPhones para você?

**Resultado:** PASSOU

---

**Pergunta:** Cancela meu pedido 1042.

**Tools:** `nenhuma`

**Resposta:**

Sinto muito, mas não é possível cancelar pedidos, essa função não é suportada pela loja. Posso te ajudar com alguma outra dúvida sobre nossos produtos?

**Resultado:** PASSOU

---


## Estado final da loja

- PASSOU: Estoque do produto 1 = 65
- PASSOU: Estoque do produto 4 = 13
- PASSOU: Estoque do produto 6 = 0
- PASSOU: Pedido 1042 continua enviado
- PASSOU: Nenhum pedido além do 1002 (1003 não existe)
- PASSOU: Produto 999 não existe
- PASSOU: Pedido 9999 não existe
```

## O que deixei de fora, de propósito

Docker, banco de dados, autenticação, streaming, framework de agente, testes automatizados além do script de aceite e qualquer função além das 4 tools (como cancelar ou editar pedidos). O desafio pede algo simples, e cada uma dessas coisas seria mais código para manter sem ser necessária aqui.

## O que eu faria diferente com mais tempo

**Pedido criado seguido de falha do Gemini.** Se o Gemini falhar logo depois de criar um pedido, o cliente lê "tente de novo", e repetir cria outro pedido. Provoquei isso num teste com um Gemini simulado. Eu informaria o número do pedido já criado na mensagem de erro.

**O teste do sem estoque.** Hoje, para testar o produto sem estoque, o script de aceite é extremamente rígido, a ponto de não aceitar "indisponível" e nem "esgotado", apenas se o Gemini falar "sem estoque". Eu faria o script aceitar sinônimos como "indisponível" e "esgotado".

**Rodar os testes de aceite várias vezes.** Como o modelo varia, uma execução aprovada não garante muito. Eu mediria quantas vezes em 10 cada caso passa.

**Banco de dados de verdade,** para o estoque e os pedidos sobreviverem a um reinício.

**Autenticação.** Hoje qualquer pessoa consulta qualquer pedido pelo número.

**Limite no histórico.** Reenviar a conversa inteira fica mais caro a cada mensagem, então numa conversa longa seria preciso resumir ou cortar.

**Cancelar e editar pedidos** como novas tools, com confirmação (e autenticação) do cliente.
