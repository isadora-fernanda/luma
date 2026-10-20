<p align="center"><img src="docs/logo.png" alt="Logo do Luma" width="120"></p>

# Luma, fotos colaborativas para eventos

O Luma é uma plataforma em que os convidados de um evento entram pelo QR code, fotografam pelo próprio site e as fotos vão para uma galeria única, aprovada pelo organizador e disponível por um prazo definido. Foi o projeto final, feito em equipe de cinco pessoas, do curso Python para Inteligência Artificial do Entra21 (Blusoft e ACATE), em 2026, e foi publicado e testado pela turma num evento real, com 9 participantes. Como o produto pode continuar sendo desenvolvido, o código completo é privado. Este repositório reúne a parte que eu desenvolvi, a **câmera e o tratamento de fotos e vídeos no navegador**, e alguns outros módulos independentes do sistema, todos com testes.

> **English:** Luma is a collaborative photo platform for events. Guests join through a QR code, take photos in the browser, and the photos go to a single gallery approved by the organizer. Built by a team of five as the final project of Entra21 (2026) with Next.js, React, TypeScript, MySQL and a Python image-moderation service. The full code is private. This repository shows my part of the project, the in-browser camera and photo/video processing, plus a few other self-contained modules, all with tests.

## Telas

<p align="center">
  <img src="docs/convidado.gif" alt="Telas do convidado" width="300">
  &nbsp;&nbsp;
  <img src="docs/organizador.gif" alt="Telas do organizador" width="300">
</p>

<p align="center"><i>À esquerda, o caminho do convidado, da página inicial à câmera e à galeria. À direita, o painel do organizador, com o QR Code, as configurações, os temas e o cálculo do plano.</i></p>

## Arquitetura

```
convidado e organizador (navegador, celular)
        │  HTTPS
        ▼
Caddy (HTTPS automático, arquivos estáticos)
        │
        ▼
Next.js 16 + React 19 (TypeScript)
  ├─ telas do evento, câmera, galeria e painel do organizador
  ├─ rotas de API: eventos, participantes, fotos, mídia, sessão
  ├─ login com Google (OAuth) e sessão com JWT
  │
  ├──► MySQL 8 (Drizzle ORM), rede privada
  ├──► pasta de mídia no servidor (fotos, vídeos e papéis de parede)
  └──► API de moderação em Python (FastAPI + modelo da Hugging Face)

Tudo em contêineres Docker numa VPS da Hostinger, com deploy pelo GitHub Actions
depois que os testes e o build passam.
```

## Como funciona

### 1. Fluxo do evento

1. O convidado lê o QR code do evento e entra com a conta Google.
2. Fotografa pelo próprio site, com a câmera frontal ou traseira, ou escolhe fotos e vídeos do celular.
3. Confere a prévia e envia.
4. O organizador aprova cada envio, ou deixa a publicação automática.
5. A galeria fica disponível ao vivo durante o evento e por um prazo depois dele.

O organizador escolhe o tema da página (aniversário, casamento, festa, final de ano ou profissional, em versão clara ou escura), define quantas fotos cada pessoa pode enviar, e as fotos podem ser baixadas em ZIP.

### 2. Câmera no navegador (`src/CameraCapture.tsx` e `src/camera-math.ts`), minha parte

A câmera abre direto no site, sem instalar aplicativo, com `getUserMedia`.
- **Foto ou vídeo no mesmo botão.** Um toque tira a foto. Segurando por mais de 0,2 s, começa a gravar com `MediaRecorder`, e a gravação para sozinha em 10 s, com um anel de progresso no botão.
- **Formato de vídeo de cada navegador.** O Safari só grava MP4 e o Chrome costuma gravar WebM, então a câmera testa os formatos em ordem e usa o primeiro que o navegador aceita.
- **Câmera frontal e traseira.** Se o aparelho recusar a câmera pedida com exatidão, o pedido vai ficando mais flexível até conseguir abrir alguma. Na frontal, a imagem e a foto saem espelhadas, como num espelho.
- **Zoom de pinça.** Quando a câmera tem zoom próprio, ele é usado pelo `applyConstraints`. Quando não tem, o zoom é digital, recortando o centro da imagem na hora da foto.
- **Foco por toque.** O ponto tocado na tela é convertido para a coordenada do sensor, considerando o corte da imagem e o espelhamento da câmera frontal.
- **Mesmo enquadramento.** O vídeo preenche a tela cortando as bordas, e a foto é recortada do mesmo jeito, para sair igual ao que a pessoa viu.

Os cálculos de enquadramento, zoom, foco e formato de gravação ficam em `camera-math.ts`, separados do componente, para poderem ser testados sem câmera. O componente foi extraído do código do projeto e depende de React e `lucide-react`. As classes CSS ficam no código privado.

### 3. Fotos, vídeos, GIF e ZIP no navegador (`src/media-files.ts` e `src/media-tools.ts`), minha parte

Todo o tratamento de mídia acontece no celular, antes do envio, para economizar internet e servidor.
- **Otimização das fotos.** A foto tem a orientação corrigida, o lado maior reduzido para 2400 px e a qualidade do JPEG baixada aos poucos até ficar com até 4 MB. GIFs são enviados como estão, para não perder a animação.
- **Formatos do celular.** Alguns aparelhos enviam vídeos e fotos sem o tipo do arquivo preenchido. Nesses casos, o formato é reconhecido pela extensão, incluindo MOV do iPhone, HEIC, 3GP e MKV.
- **Vídeo para GIF.** Extrai até 80 quadros do vídeo com `<canvas>`, reduz as cores para uma paleta fixa de 256 com pontilhado de Bayer e codifica o GIF com compressão LZW, escrita sem bibliotecas.
- **Download em ZIP.** Monta o arquivo ZIP byte a byte, com cabeçalhos e CRC-32, para baixar várias fotos de uma vez.

### 4. Cotas de fotos (`src/photo-limits.ts` e `src/photo-quota.ts`)

Cada evento tem um limite de participantes e de fotos por participante, e o total é sempre o produto dos dois. Quando o organizador muda os limites, o módulo calcula a diferença e quantas fotos novas precisam ser cobradas. O organizador também pode transferir fotos livres de um participante para outro. A transferência só usa o saldo que ainda não foi enviado, exige que os dois sejam do mesmo evento e confere que o total do par não muda.

### 5. Agenda do evento (`src/event-schedule.ts`)

Todo evento dura no mínimo 7 dias a partir do início. Depois do fim, os participantes têm mais 7 dias de acesso e o organizador tem 14. Quando um evento é remarcado, a duração e as janelas de acesso estendidas são preservadas. A data de hoje é calculada no fuso de São Paulo, para que um evento criado à noite não caia no dia errado.

### 6. Armazenamento de mídia (`src/media-storage.ts`)

As mídias ficam numa pasta do servidor, fora da imagem Docker. O módulo recusa chaves com `..` ou segmentos vazios, o que impede que um nome de arquivo malicioso saia da pasta. Cada envio é gravado num arquivo temporário e só depois renomeado, então uma falha no meio do upload não deixa arquivo corrompido.

### 7. Moderação de imagens (`moderation/`)

Uma API em FastAPI recebe cada imagem enviada e a classifica com o modelo [Falconsai/nsfw_image_detection](https://huggingface.co/Falconsai/nsfw_image_detection), da Hugging Face. Imagens com pontuação de conteúdo impróprio a partir de 0,80 são bloqueadas. A API aceita no máximo 20 MB por imagem e roda uma inferência por vez, para caber na memória da VPS. Ela não é exposta à internet, só à aplicação.

## Como rodar

Os módulos em TypeScript não têm dependências. O componente `CameraCapture.tsx` é mostrado como referência e precisa de React e `lucide-react` para rodar dentro de um projeto Next.js. Requer Node.js 22.6 ou mais novo, que roda TypeScript direto.

1. Rode os testes.

```
npm test
```

2. Para a API de moderação, construa e rode o contêiner. Na primeira execução, o modelo é baixado da Hugging Face.

```
cd moderation
docker build -t luma-moderation .
docker run -p 8000:8000 luma-moderation
```

3. Envie uma imagem para testar.

```
curl -F "file=@foto.jpg" http://localhost:8000/moderate
```

## Testes

```
npm test
```

São 35 testes com o executor nativo do Node (`node:test`). Eles cobrem os cálculos da câmera (enquadramento, zoom digital, foco espelhado, zoom de pinça, formato e duração da gravação), o reconhecimento dos formatos de mídia, o cálculo e o ajuste das cotas, a transferência de fotos entre participantes, as datas e janelas de acesso dos eventos, a geração do ZIP e a leitura dos arquivos de mídia. O GitHub Actions roda todos a cada push.

## Estrutura

```
luma/
├── src/
│   ├── CameraCapture.tsx   # componente da câmera (React)
│   ├── camera-math.ts      # enquadramento, zoom, foco e formato de gravação
│   ├── media-files.ts      # formatos de mídia e otimização das fotos
│   ├── photo-limits.ts     # limites de fotos por evento e por pessoa
│   ├── photo-quota.ts      # transferência de fotos entre participantes
│   ├── event-schedule.ts   # duração e janelas de acesso dos eventos
│   ├── media-tools.ts      # vídeo para GIF e ZIP no navegador
│   └── media-storage.ts    # gravação e leitura segura das mídias
├── moderation/             # API de moderação em Python
├── tests/                  # testes dos módulos
└── docs/                   # imagens deste README
```

## Próximos passos

O roadmap do produto inclui pagamento dentro da plataforma, figurinhas, reações personalizadas, desafios fotográficos para os convidados e reconhecimento facial para cada pessoa encontrar as próprias fotos.

## O que eu faria diferente hoje

- **Componente da câmera grande demais.** Ele cuida da câmera, da gravação, do zoom e do foco ao mesmo tempo. Eu separaria cada parte num hook próprio, como `useCameraStream`, `useRecorder` e `usePinchZoom`.
- **Foco por toque em poucos aparelhos.** O `pointsOfInterest` não faz parte do padrão e só funciona em alguns celulares Android. Nos outros, a mira aparece mas o aparelho mantém o foco automático.
- **Vídeos em formatos diferentes.** Cada navegador grava num formato, então a galeria recebe MP4 e WebM misturados. Eu converteria tudo para MP4 no servidor, para tocar igual em qualquer aparelho.
- **GIF com paleta fixa.** A paleta de 256 cores é a mesma para qualquer vídeo, o que deixa tons de pele e degradês com faixas visíveis. Uma paleta calculada a partir dos próprios quadros daria um resultado melhor.
- **ZIP na memória.** O ZIP é montado inteiro na memória do celular e sem compressão. Para eventos grandes, eu geraria o arquivo em partes, como um fluxo, e usaria ZIP64 acima de 4 GB.
- **Moderação limitada.** O modelo só separa conteúdo normal de impróprio e roda uma imagem por vez no processador. Com mais usuários, eu usaria uma fila e um servidor com GPU.
- **Números soltos no código.** Alguns valores, como o multiplicador 7 usado no pacote de fotos extras, estão escritos direto nas funções. Eles iriam para uma configuração única do plano.

---

Projeto desenvolvido em equipe. Repositório mantido por **Isadora Fernanda Zappe Schmidt** · [LinkedIn](https://www.linkedin.com/in/isadora-fernanda)
