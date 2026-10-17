---
title: Solução de problemas
description: Os motivos mais comuns para uma conexão ou uma query falhar e o que tentar.
category: Referência
order: 13
related: [connections, docker-cli]
---

# Solução de problemas

Quando algo falha, o DbLocal mostra uma mensagem curta e deixa o detalhe técnico a um clique. A maioria dos problemas cai num destes.

## O teste de conexão falha {#connection}

| Mensagem | O que verificar |
| --- | --- |
| Falha de autenticação | Usuário e senha. No Postgres, também o nome do banco: ele faz parte do login. |
| Não foi possível alcançar o servidor | Host e porta, e se o servidor está rodando. No Docker use `host.docker.internal`, não `localhost`. |
| Tempo esgotado | Um firewall ou o endereço errado. Via SSH, confira primeiro as configurações do túnel. |
| SSL obrigatório / certificado | Escolha o modo de SSL que o servidor espera; `require` criptografa sem verificar o certificado. |
| Arquivo não encontrado (SQLite) | O caminho precisa existir onde o DbLocal roda. No Docker, monte o arquivo e use o caminho de dentro do container. |

## O banco saiu do ar {#offline}

Se um banco para de responder enquanto você trabalha (servidor parado, rede fora, VPN desligada), a tabela ou o diagrama que você abrir mostra **Não foi possível conectar** com o motivo, dentro do DbLocal: a barra lateral, as abas e as outras conexões continuam funcionando. Suba o banco de novo e clique em **Tentar novamente**, ou em **Voltar às conexões**.

## Túnel SSH {#ssh}

O host e a porta do banco são os **vistos pelo servidor SSH**, não pela sua máquina. Se a sessão cair, a próxima ação reconecta sozinha.

## Uma tabela parece desatualizada {#stale}

O DbLocal guarda o schema em cache. Depois de alterá-lo fora do DbLocal, use **Atualizar schema** (barra lateral ou paleta de comandos). Rodar DDL no editor SQL o atualiza por você.

## Não consigo editar uma tabela {#read-only}

As linhas só são editáveis quando a tabela tem chave primária (ou um índice único em colunas não nulas). Views e tabelas sem uma são somente leitura. Uma conexão somente leitura, ou `--readonly`, desliga a edição em todo lugar.

## Uma query é cancelada {#timeout}

Os statements param no timeout (30 segundos por padrão) e os resultados no limite de linhas (1.000). Ambos ficam nas configurações do editor.

## Muitas tentativas de login {#login}

O login é limitado a cinco tentativas por minuto por endereço. Espere um minuto e tente de novo.
