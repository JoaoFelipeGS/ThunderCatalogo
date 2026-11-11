# Thunder Sthormy — catálogo

Catálogo responsivo de roupas com banner metálico da marca otimizado em WebP, zoom suave e reflexo animado contínuos, respeitando a preferência por movimento reduzido, modos claro e escuro (escuro por padrão), busca, filtros, fotos sem corte nos cards, galeria com setas discretas exibidas apenas no card em foco, visualização ampliada, tamanhos, carrinho persistente e pedidos pelo WhatsApp. O catálogo pode ser instalado como PWA e mantém a interface, os produtos públicos e imagens hospedadas no próprio site previamente carregados disponíveis offline; imagens externas, pedidos e alterações do estoque continuam dependendo de conexão. O botão “Carrinho” fica visível na barra superior, mostra a quantidade de itens e abre o carrinho automaticamente após adicionar uma peça. O cliente pode adicionar várias peças e quantidades ao carrinho e enviar o pedido completo pelo WhatsApp, ou comprar uma única peça diretamente. A preferência de tema fica salva no navegador, e a pessoa pode alternar pelo botão na barra superior minimalista. A identidade visual aparece no banner. O painel administrativo separado, em `/painel-estoque-7f3a9c`, permite controlar a disponibilidade do estoque e cadastrar, editar ou excluir peças; durante a edição, fotos existentes podem ser removidas individualmente.
As páginas personalizadas `404.html` e `500.html` mantêm a identidade visual da marca; o servidor local exibe a página correspondente para erros HTML e mantém erros da API em JSON.

## Instalar no celular

- **Android/Chrome:** abra o catálogo online e use “Instalar app” quando aparecer, ou escolha **Instalar app/Adicionar à tela inicial** no menu do navegador.
- **iPhone/iPad:** abra o catálogo no Safari, toque em **Compartilhar** e escolha **Adicionar à Tela de Início**.
- Abra o catálogo ao menos uma vez com internet para preparar o acesso offline. Produtos públicos carregados e imagens hospedadas no próprio site que já foram visitadas podem ficar disponíveis sem conexão; imagens externas, pedidos pelo WhatsApp e alterações do estoque precisam de internet.

## Atenção ao plano Vercel Hobby

A documentação oficial da Vercel restringe o plano gratuito Hobby a uso pessoal e não comercial. Como este site divulga uma loja e recebe pedidos, confirme os termos antes de colocá-lo no ar: para uso comercial, escolha um plano permitido (como Pro) ou uma hospedagem gratuita que autorize expressamente esse uso. Não publique a loja comercial no Hobby contando com uma exceção.

O site foi preparado para as Functions da Vercel, mas os recursos de cadastro precisam de armazenamento persistente externo. Não use arquivos locais de Function para guardar produtos ou fotos: esse disco não é o banco de dados do site.

## Configurar a senha do admin antes de publicar

1. Crie uma senha exclusiva, longa e não usada em nenhum outro serviço. Ela deve ter pelo menos 16 caracteres.
2. Gere um segredo de sessão aleatório no PowerShell:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

3. Na Vercel, abra o projeto em **Settings → Environment Variables** e adicione:

   | Nome | Valor |
   | --- | --- |
   | `ADMIN_PASSWORD` | A senha longa e exclusiva escolhida |
   | `ADMIN_SESSION_SECRET` | O segredo aleatório gerado no passo 2 |
   | `WHATSAPP_NUMBER` | Número com código do país e DDD; somente dígitos, por exemplo `5514991107618` |

   Marque como **Sensitive/Secret** quando disponível. Cadastre segredos somente para **Production**; só compartilhe os mesmos segredos com **Preview** se realmente precisar e confiar em quem acessa as prévias.

4. O catálogo precisa de um banco persistente para registrar as alterações:
   - Crie uma base **Upstash Redis** pelo Marketplace/Integration da Vercel. No plano gratuito atual da Upstash, a documentação lista 250 MB e 500 mil comandos por mês; consulte os limites atuais antes de depender deles.
   - Conecte a base ao projeto. A integração Upstash cria `KV_REST_API_URL` e `KV_REST_API_TOKEN`, que o catálogo reconhece automaticamente. Se cadastrar as credenciais manualmente, também pode usar `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`. Use o token de escrita apenas no servidor; nunca o exponha em código do navegador. Não use `KV_REST_API_READ_ONLY_TOKEN`, pois o catálogo precisa gravar dados. Se o upload da foto der certo mas salvar a peça retornar erro, confira se `KV_REST_API_TOKEN` é o token read/write e se está configurado em Production.
   - O primeiro acesso inicializa a chave do catálogo no Redis com as 24 peças que vêm neste repositório.

5. Para guardar fotos novas, crie e conecte um **Vercel Blob Store público** ao projeto. A conexão fornece autenticação gerenciada por OIDC e o ID do armazenamento; o catálogo reconhece `BLOB_STORE_ID` ou um nome de variável personalizado terminado em `_BLOB_STORE_ID` e prefere esse método ao token estático. Também aceita `BLOB_READ_WRITE_TOKEN` (ou uma variável personalizada terminada em `_BLOB_READ_WRITE_TOKEN`) como alternativa. Mantenha credenciais somente no servidor. As fotos enviadas ficam públicas para que apareçam no catálogo. Sem uma conexão/credencial Blob, ainda é possível entrar no admin, editar e excluir peças e manter as fotos existentes; o envio de fotos novas fica indisponível. Se o upload for recusado, confirme que o Blob Store é público, está conectado a este projeto e ao ambiente **Production**; depois faça um novo deploy.
6. Após adicionar ou alterar variáveis e integrações, faça um novo deploy para que as Functions recebam a configuração.
7. Abra `/painel-estoque-7f3a9c` no endereço publicado, entre com `ADMIN_PASSWORD` e teste o cadastro de uma peça e de uma foto. O painel mostra o estoque e permite marcar peças como disponíveis ou sem estoque. A senha nunca é escrita no catálogo nem enviada ao público; o admin exige sessão assinada, cookie `HttpOnly`, `SameSite=Strict`, HTTPS e proteção contra tentativas repetidas.

Sem `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` ou Redis, a área administrativa permanece desativada. O Blob é necessário apenas para enviar fotos novas.

## Importar o projeto do GitHub para a Vercel

1. Confirme se a Vercel permite o seu uso comercial. Se estiver autorizado a prosseguir, entre na Vercel e escolha **Add New → Project → Import Git Repository**.
2. Autorize o acesso ao GitHub e selecione `JoaoFelipeGS/ThunderCatalogo`, branch `main`.
3. Configure a pasta raiz como `./`. O `vercel.json` seleciona o preset **Other** para impedir que a Vercel tente iniciar o projeto como um servidor Node genérico. Não defina uma pasta de saída separada nem um comando de build. A Function de API está em `api/[...path].js`; os arquivos do catálogo ficam em `public/`.
4. Em **Settings → General → Node.js Version**, selecione Node.js 24, se a opção estiver disponível. O projeto também declara Node.js `24.x` em `package.json`.
5. Antes do primeiro deploy, adicione em **Settings → Environment Variables** os segredos e o WhatsApp listados acima. As variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` criadas pela integração Upstash são reconhecidas pelo site; conecte também o Vercel Blob para disponibilizar `BLOB_READ_WRITE_TOKEN`.
6. Volte à aba **Deployments** e crie um novo deploy da branch `main` (ou faça **Redeploy**). O primeiro acesso público inicializa o catálogo no Redis com os 24 produtos do repositório.
7. Abra o endereço `.vercel.app` gerado e confirme que as peças aparecem. Acesse `/painel-estoque-7f3a9c`, entre com sua senha e cadastre uma peça de teste; confirme que ela continua no catálogo após recarregar ou fazer um novo deploy. Exclua a peça de teste.
8. Teste o pedido: abra uma peça, selecione um tamanho e use o botão do WhatsApp. Confirme no WhatsApp que o destinatário corresponde a `WHATSAPP_NUMBER`.

Como o repositório é público, o código, as fotos da coleção e os dados iniciais do catálogo poderão ser vistos e clonados por qualquer pessoa. Isso não expõe os segredos: as credenciais reais ficam somente no painel da Vercel. Não torne o repositório privado ou público inadvertidamente; mantenha em **Public** apenas se estiver de acordo com a divulgação das fotos e do catálogo.

## Atualizar o site após uma mudança

Altere e teste o projeto localmente, faça um commit e envie-o à branch `main`. A integração GitHub/Vercel cria o deploy de produção correspondente. Mudanças nas variáveis de ambiente também precisam de um novo deploy. Não coloque as variáveis reais nos commits, em issues ou no chat.

## Variáveis necessárias

```text
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
WHATSAPP_NUMBER=5514991107618
KV_REST_API_URL=
KV_REST_API_TOKEN=
BLOB_READ_WRITE_TOKEN=
```

As variáveis `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` também são aceitas como nomes alternativos para o Redis.

`.env` e outros arquivos locais de variáveis são ignorados pelo Git. Nunca cole valores reais de senha, sessão, Upstash ou Blob no código, em capturas de tela ou no chat.

## Rodar localmente

Instale Node.js 24 e as dependências:

```powershell
npm install
$env:ADMIN_PASSWORD = "uma-senha-local-com-16-caracteres-ou-mais"
$env:WHATSAPP_NUMBER = "5514991107618"
node catalog-server.cjs
```

Abra `http://localhost:3000`. Os dados cadastrados localmente ficam em `data/products.json` e as fotos em `public/uploads/`. A instalação local não precisa de Redis ou Vercel Blob.

## Imagens e backups

As 24 peças iniciais e as fotos otimizadas vêm da pasta de anúncios fornecida. O catálogo usa miniaturas WebP de 700 px para as fotos dos cartões e carrega a foto maior apenas ao abrir os detalhes. Novas fotos são reduzidas para no máximo 900 px e convertidas para WebP; na hospedagem, são guardadas no Blob, e localmente, em `public/uploads/`. Na documentação atual, a franquia do Blob Hobby lista 1 GB de armazenamento, 10.000 operações simples, 2.000 avançadas e 10 GB de transferência; a franquia pode mudar e parte é compartilhada com os outros serviços do projeto. Faça backups do banco e do armazenamento de fotos e teste a restauração. Acompanhe as cotas do Blob e do Upstash no painel para evitar interrupções.

## Documentação oficial consultada

- [Plano Hobby e limites de uso](https://vercel.com/docs/plans/hobby)
- [Variáveis de ambiente na Vercel](https://vercel.com/docs/environment-variables)
- [Vercel Functions para Node.js](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel Blob: limites e preços](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- [Upstash Redis: limites e preços do plano gratuito](https://upstash.com/docs/redis/overall/billing)
