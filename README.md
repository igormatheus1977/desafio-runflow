# Agente de atendimento para loja de iPhones

Este projeto é um agente de atendimento para uma loja online de iPhones. Você conversa com ele no terminal, em português normal, e ele consulta produtos, consulta pedidos e cria pedidos. Para isso, o Gemini decide o que precisa ser consultado, e o meu código faz a chamada a uma API mock da loja (uma API de mentira, com os dados em memória).

## Como rodar

**Você vai precisar de:** Node.js 20.6 ou mais novo (é ele que lê o `.env`, por isso não usei `dotenv`) e uma chave do Gemini, criada em [aistudio.google.com](https://aistudio.google.com), em "Get API key".

**1. Instale as dependências:**

```bash
npm install
```

**2. Crie o arquivo `.env` a partir do exemplo:**

```bash
cp .env.example .env
```

**3. Abra o `.env` e preencha as variáveis.** Só a chave é obrigatória:

| Variável          | Para que serve                                              |
| ------------------ | ----------------------------------------------------------- |
| `GEMINI_API_KEY` | Sua chave do Gemini (obrigatória)                          |
| `GEMINI_MODEL`   | Modelo usado. Se ficar vazio, usa `gemini-3.1-flash-lite` |
| `API_PORT`       | Porta da API da loja. Se ficar vazio, usa `3000`          |

**4. Ligue a API da loja em um terminal:**

```bash
npm run api
```

**5. Abra o chat em um segundo terminal:**

```bash
npm run chat
```

Digite sua mensagem e aperte Enter. Para encerrar, digite `sair`.

**Para rodar os testes de aceite** (usa o Gemini de verdade e liga sozinho uma API própria na porta 3100, então não precisa do passo 4):

```bash
npm run aceite
```

**Para checar os tipos do TypeScript:**

```bash
npm run typecheck
```

## Como funciona

```
Você (terminal) → chat.ts → agente.ts ⇄ Gemini
                               ↓ o Gemini PEDE uma tool; o meu código executa
                           tools.ts → fetch → API da loja (Fastify) → JSON
```

O ponto principal é que **o Gemini não acessa a loja**. Ele só pede uma tool. A cada mensagem, o agente faz o seguinte:

1. Coloca a mensagem no histórico e envia ao Gemini o histórico inteiro, a system prompt e a lista de tools.
2. Se o Gemini pedir uma tool, o meu código executa, guarda o pedido e o resultado no histórico e chama o Gemini de novo.
3. Se o Gemini responder com texto, esse texto vai para você e o loop termina.

Esse loop tem um limite de 6 voltas por mensagem, para não girar para sempre.

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

**Dados de teste:** a loja já começa com 6 iPhones e **3 pedidos prontos: 1040, 1041 e 1042**. Eles existem só para testar a consulta de pedidos, e nenhum cliente os criou. Os pedidos que o cliente cria começam em **1001**.

| Pedido de teste | Status | Itens | Total |
| --- | --- | --- | --- |
| 1040 | entregue | 1x iPhone 14, 1x iPhone 17 | R$ 15.000 |
| 1041 | em_processamento | 1x iPhone 16 | R$ 8.000 |
| 1042 | enviado | 2x iPhone 15, 1x iPhone 14 | R$ 17.000 |

**Endpoints da API:** `GET /products`, `GET /products/:id`, `GET /orders/:id` e `POST /orders`.

**Tools:** `list_products`, `get_product`, `get_order_status` e `create_order`.

## Decisões técnicas e por quê

- **Loop escrito à mão, sem framework de agente.** São poucas linhas, e dá para ver exatamente o que acontece. Um framework esconderia justamente a parte que eu mais preciso entender.
- **Gemini `gemini-3.1-flash-lite`.** O `gemini-2.5-flash` do enunciado deu erro 404, porque foi aposentado para contas novas. Nos modelos "flash" completos, o plano gratuito limitou a cerca de 5 requisições por minuto, e cada mensagem com tool gasta 2. O `flash-lite` conseguiu rodar todos os testes. Ele também pede esperas por causa da cota: nas execuções recentes dos testes houve espera em todas, de até cerca de 1 minuto, e por isso existe a repetição automática. O nome do modelo fica em `GEMINI_MODEL`, então trocar não exige mudar o código.
- **SDK oficial `@google/genai`.** Assim não preciso montar as requisições HTTP à mão.
- **TypeScript rodando com `tsx`.** Os tipos ajudam a evitar erros no formato dos dados, e o `tsx` dispensa uma etapa de build.
- **Fastify com dados em memória.** Para uma API mock, um servidor simples basta e um banco de dados seria exagero. A consequência é que, ao reiniciar a API, o estoque e os pedidos voltam ao início.
- **`POST /orders` valida todos os itens antes de alterar qualquer coisa.** Se um item falha, nada é descontado, e não fica um pedido pela metade.
- **Histórico guardado exatamente como veio.** Os modelos Gemini 3 exigem que a resposta com os pedidos de tool seja mantida como foi recebida. E, como o Gemini não tem memória própria, o histórico inteiro é reenviado a cada chamada.
- **Consulta obrigatória quando o cliente cita um número.** Nos testes, o agente respondeu sobre o produto 999 só olhando o histórico, sem chamar a tool. A resposta estava certa, mas o caminho estava errado, porque o dado do histórico pode estar velho. Coloquei essa regra na system prompt.
- **Pedidos não podem ser editados.** Se o cliente pede para "adicionar" itens, o agente explica isso e pergunta se pode criar um novo pedido. Ao oferecer, ele precisa citar o produto e a quantidade. Depois do "sim", chama `create_order` sem perguntar de novo. Criei essa regra porque, nos testes, o agente às vezes não citava o produto e perguntava duas vezes.
- **Pedidos novos começam em 1001, e os 3 de teste têm números fixos.** Separa o que o cliente criou do que veio pronto. O limite é que o 40º pedido criado na mesma sessão receberia o número 1040, repetindo um pedido de teste. Para uma API mock que volta ao início quando reinicia, deixei assim.
- **Poucos arquivos, com uma responsabilidade cada.** Fica fácil achar cada coisa e explicar o projeto.
- **Nomes em português.** Campos, variáveis e mensagens ficam em português. Só as rotas e os nomes das tools ficam em inglês, como no enunciado.

## O que acontece quando algo dá errado

- **Produto ou pedido não existe:** a API responde 404, a tool devolve `{ erro }` e o agente avisa o cliente, sem inventar.
- **Estoque insuficiente:** a API recusa o pedido inteiro (400) e nada é descontado.
- **Argumento inválido** (id que não é número, lista vazia, quantidade negativa): a própria tool recusa, antes de chamar a API.
- **Tool que não existe:** devolve `{ erro }` em vez de quebrar. Como não há tool de cancelamento, o agente não tem como cancelar um pedido.
- **API da loja fora do ar:** o chat avisa ao iniciar. Se ela cair durante a conversa, a tool devolve uma mensagem de erro clara.
- **Gemini com erro 429 ou 503:** faço até 3 tentativas. No 429, espero o tempo que o Google informa; sem essa informação, espero 2s e depois 4s. Se falhar de vez, o chat mostra uma mensagem em português e o turno é desfeito, para o histórico não ficar quebrado.

## Testes de aceite (transcrição)

São os 6 fluxos do enunciado (13 mensagens, mais o "sim" de confirmação), numa única sessão com histórico e com a API recém-ligada. Esta é a saída real de `npm run aceite`, que também grava [docs/transcricoes.md](docs/transcricoes.md). A linha `[tool]` mostra a tool que o agente chamou.

O script não olha só o texto: ele também confere quais tools foram chamadas e, no final, pergunta à API como ficaram o estoque e os pedidos. O estoque de 65 no teste de 1000 unidades é o valor real naquele momento, porque o pedido 1001 já tinha descontado 2 unidades do iPhone 13 (67 - 2).

**Uma limitação:** o Gemini não responde igual toda vez, então uma nova execução pode sair diferente. Na última rodada, com o código final, os fluxos rodaram 3 vezes: 2 passaram inteiras e 1 foi reprovada. Nessa reprovada, o agente avisou que o iPhone 18 estava "esgotado", e o script exige as palavras "sem estoque". Mantive a checagem rígida de propósito. A transcrição abaixo é de uma execução aprovada. O script confere trechos do texto, então não avalia se a resposta está bem escrita.

```
Você: Quais produtos vocês têm disponíveis?
  [tool] list_products({})

Agente: Temos os seguintes modelos disponíveis:

* **iPhone 13**: R$ 4.000,00
* **iPhone 14**: R$ 5.000,00
* **iPhone 15**: R$ 6.000,00
* **iPhone 16**: R$ 8.000,00
* **iPhone 17**: R$ 10.000,00

O iPhone 18 está sem estoque no momento.
  [PASSOU]

Você: Me mostra só os que estão em estoque.

Agente: Estes são os modelos com estoque disponível:

* **iPhone 13**: R$ 4.000,00
* **iPhone 14**: R$ 5.000,00
* **iPhone 15**: R$ 6.000,00
* **iPhone 16**: R$ 8.000,00
* **iPhone 17**: R$ 10.000,00
  [PASSOU]

Você: Me conta mais sobre o produto 3.
  [tool] get_product({"id":3})

Agente: O iPhone 15 custa R$ 6.000,00 e temos 45 unidades em estoque. Deseja realizar a compra?
  [PASSOU]

Você: E quanto custa o produto 2?
  [tool] get_product({"id":2})

Agente: O iPhone 14 custa R$ 5.000,00 e temos 22 unidades em estoque. Gostaria de comprar este modelo?
  [PASSOU]

Você: Quero 2 unidades do produto 1 e 1 unidade do produto 4
  [tool] create_order({"itens":[{"produtoId":1,"quantidade":2},{"quantidade":1,"produtoId":4}]})

Agente: Pedido criado com sucesso! O número do seu pedido é 1001 e o total é R$ 16.000,00.
  [PASSOU]

Você: Adiciona 3 do último que você me mostrou

Agente: Como explicado, não é possível editar pedidos existentes. Você gostaria de criar um novo pedido com 3 unidades do iPhone 16?
  [PASSOU]

Você: sim
  [tool] create_order({"itens":[{"produtoId":4,"quantidade":3}]})

Agente: Pedido criado com sucesso! O número do seu pedido é 1002 e o total é R$ 24.000,00.
  [PASSOU]

Você: Qual o status do pedido 1042?
  [tool] get_order_status({"id":1042})

Agente: O pedido 1042 está com status de "enviado". Ele contém 2 unidades do iPhone 15 e 1 unidade do iPhone 14, com um total de R$ 17.000,00.
  [PASSOU]

Você: E o que eu pedi nele mesmo?

Agente: O pedido 1042 contém:

* 2 unidades de iPhone 15
* 1 unidade de iPhone 14
  [PASSOU]

Você: Me fala do produto 999.
  [tool] get_product({"id":999})

Agente: Não foi possível encontrar o produto 999 em nosso catálogo. Posso ajudar com algo mais?
  [PASSOU]

Você: Quero comprar 1000 unidades do produto 1.
  [tool] get_product({"id":1})

Agente: Infelizmente não temos essa quantidade disponível. Temos apenas 65 unidades do iPhone 13 em estoque. Deseja realizar o pedido com uma quantidade menor?
  [PASSOU]

Você: Qual o status do pedido 9999?
  [tool] get_order_status({"id":9999})

Agente: Não foi possível localizar o pedido 9999. Poderia conferir o número, por favor?
  [PASSOU]

Você: Qual a previsão do tempo em SP?

Agente: Sinto muito, mas não posso te ajudar com previsões do tempo. Estou aqui apenas para tirar dúvidas sobre produtos e pedidos da nossa loja. Posso ajudar com algo relacionado a eles?
  [PASSOU]

Você: Cancela meu pedido 1042.

Agente: Não é possível realizar cancelamentos. Esse procedimento não é suportado pela nossa loja. Posso ajudar com mais alguma informação sobre produtos ou pedidos?
  [PASSOU]

Estado final da loja:
PASSOU: Estoque do produto 1 = 65
PASSOU: Estoque do produto 4 = 13
PASSOU: Estoque do produto 6 = 0
PASSOU: Pedido 1042 continua enviado
PASSOU: Nenhum pedido além do 1002 (1003 não existe)
PASSOU: Produto 999 não existe
PASSOU: Pedido 9999 não existe

TODOS OS TESTES PASSARAM
```

## O que deixei de fora, de propósito

Docker, banco de dados, autenticação, streaming, framework de agente, testes automatizados além do script de aceite e qualquer função além das 4 tools (como cancelar ou editar pedidos). O desafio pede algo simples, e cada uma dessas coisas seria mais código para manter sem ser necessária aqui.

## O que eu faria diferente com mais tempo

**Problemas que conheço e ainda não corrigi:**

- **Pedido criado seguido de falha do Gemini.** Se o Gemini falhar logo depois de criar um pedido, o cliente lê "tente de novo", e repetir cria outro pedido. Provoquei isso num teste com um Gemini simulado. Eu informaria o número do pedido já criado na mensagem de erro.
- **Resposta vazia do Gemini.** Apareceria em branco para o cliente. Também só vi isso com o Gemini simulado.
- **Numeração.** Eu faria a contagem pular os números 1040 a 1042.

**Melhorias:**

- **Rodar os testes de aceite várias vezes.** Como o modelo varia, uma execução aprovada não garante muito. Eu mediria quantas vezes em 10 cada caso passa.
- **Testar os endpoints e as tools sem o Gemini.** Hoje o script testa o conjunto, sempre com o modelo real. Testes separados seriam mais rápidos e não gastariam a cota.
- **Banco de dados de verdade,** para o estoque e os pedidos sobreviverem a um reinício.
- **Autenticação.** Hoje qualquer pessoa consulta qualquer pedido pelo número.
- **Limite no histórico.** Reenviar a conversa inteira fica mais caro a cada mensagem, então numa conversa longa seria preciso resumir ou cortar.
- **Streaming,** para o texto aparecer enquanto o modelo escreve.
- **Cancelar e editar pedidos** como novas tools, com confirmação do cliente.
- **Mensagens mais claras ao iniciar:** avisar logo se a chave estiver vazia ou a porta ocupada, e não mandar conferir a chave em todo erro 400.
- **Regra única de confirmação:** hoje a compra pelo número costuma criar direto, e a compra pelo nome costuma pedir confirmação.
- **Descrições das tools mais completas:** dizer o que fazer quando o cliente usa o nome do produto, e que a quantidade é inteira e positiva.
- **Script de aceite mais cuidadoso:** gravar a transcrição só quando passar e avisar se a porta 3100 já estiver em uso.
- **Pequenas limpezas:** deixar a validação de `create_order` só na API, remover do chat os ramos de entrada por arquivo, centralizar o endereço da API, tirar `dist/` do `.gitignore` e devolver 400 para id inválido.
- **Logs organizados** das chamadas ao Gemini e às tools, para investigar problemas com mais facilidade.
