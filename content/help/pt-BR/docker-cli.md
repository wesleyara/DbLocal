---
title: Docker e linha de comando
description: Rode o DbLocal pelo terminal ou num container e alcance bancos da sua máquina.
category: Referência
order: 11
related: [security, troubleshooting]
---

# Docker e linha de comando

## A linha de comando {#cli}

Faça o build uma vez e inicie o servidor com o comando `dblocal`:

```bash
pnpm build
node bin/dblocal.mjs
```

| Opção | Efeito |
| --- | --- |
| `--port <n>` | Porta de escuta (padrão `5555`). |
| `--host <addr>` | Endereço de bind (padrão `127.0.0.1`). |
| `--data-dir <dir>` | Onde ficam `dblocal.db` e `secret.key`. |
| `--readonly` | Torna toda conexão somente leitura. |
| `--no-open` | Não abre o navegador. |
| `--version`, `--help` | Mostram a versão ou o uso. |

Passe uma connection string, ou o caminho de um arquivo SQLite, e ele salva a conexão e já abre nela:

```bash
node bin/dblocal.mjs postgres://user:password@localhost:5432/shop
node bin/dblocal.mjs ./app.sqlite
```

## Docker {#docker}

```bash
docker compose -f docker/compose.example.yml up -d --build
```

Depois abra `http://127.0.0.1:5555`. Suas conexões e chaves ficam no volume `/data`, então sobrevivem a um rebuild.

> [!WARNING]
> Dentro do container o DbLocal escuta em todas as interfaces. Publique a porta só para a sua máquina (`127.0.0.1:5555:5555`), ou defina `DBLOCAL_PASSWORD` antes de expô-la além disso.

## Alcançando bancos da sua máquina {#host-databases}

Dentro de um container, `localhost` é o próprio container. Use o host `host.docker.internal` (o compose de exemplo o mapeia também no Linux) e confira se o banco aceita conexões da rede do Docker. Para abrir um arquivo SQLite, monte-o no container e use o caminho de dentro do container.

## Variáveis de ambiente {#environment}

| Variável | Efeito |
| --- | --- |
| `DBLOCAL_PASSWORD` | Liga a página de login. Sem ela, não há autenticação. |
| `DBLOCAL_ALLOWED_HOSTS` | Nomes de host extras (separados por vírgula) aceitos sem senha. `localhost` e endereços IP são sempre aceitos, assim uma página web não alcança o DbLocal por DNS rebinding. |
| `DBLOCAL_READONLY` | `1` torna toda conexão somente leitura. |
| `DBLOCAL_DATA_DIR` | Diretório de dados (padrão `~/.dblocal`, `/data` no container). |
| `DBLOCAL_SECRET` | Chave de criptografia dos segredos salvos, no lugar de `secret.key`. |
| `DBLOCAL_HOST`, `DBLOCAL_PORT` | Endereço do servidor. |
