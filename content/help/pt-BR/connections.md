---
title: Conexões
description: Salve conexões com Postgres, MySQL e SQLite, teste-as e conecte por túnel SSH.
category: Primeiros passos
order: 1
related: []
---

# Conexões

Uma conexão é uma forma salva de alcançar um banco: o host, as credenciais e, se necessário, SSL e um túnel SSH. O DbLocal guarda tudo somente nesta máquina.

## Adicionar uma conexão {#add-a-connection}

1. Clique em **Nova conexão**.
2. Escolha o dialeto e preencha os campos, ou cole uma string de conexão como `postgres://usuario:senha@host:5432/banco`. Os campos são preenchidos ao sair do campo da string.
3. Clique em **Testar conexão**. Um teste bem-sucedido mostra a versão do servidor e a latência.
4. Clique em **Salvar**.

## Senhas e segredos

Senhas, certificados SSL e chaves SSH são criptografados antes de serem guardados. Eles nunca são mostrados de novo: um campo salvo mostra "Salvo", e deixá-lo em branco mantém o valor guardado.

## SSL {#ssl}

Escolha um modo de SSL na aba **SSL**:

- **Desativado**: sem criptografia.
- **Exigir**: criptografa o tráfego, mas não verifica o certificado do servidor.
- **Verificar CA**: verifica o certificado com a CA que você colar.
- **Verificar CA e nome do host**: o modo mais rigoroso; também confere se o certificado corresponde ao host.

## Túnel SSH {#ssh-tunnel}

Ative **Conectar por túnel SSH** na aba **SSH** para alcançar um banco que só é visível a partir de um bastion. O DbLocal abre o túnel ao conectar e o reabre se a sessão SSH cair.

## Ambiente e somente leitura {#environment-and-read-only}

Na aba **Avançado**, marque a conexão como `staging` ou `prod` para ver uma faixa colorida no topo do workspace. Ative **Somente leitura** para bloquear qualquer escrita do DbLocal nessa conexão.

## Escolher um schema

Ao abrir uma conexão, a sidebar lista os schemas (Postgres) ou bancos (MySQL e SQLite). Os schemas do sistema ficam ocultos até você ativar **Mostrar schemas do sistema**. O schema escolhido fica lembrado na conexão.

## Status da conexão {#connection-status}

A barra de status no canto inferior esquerdo mostra a conexão aberta: ponto pulsando enquanto o DbLocal está **conectando**, verde quando está **conectado**, vermelho quando **não conseguiu conectar**. Em seguida vêm o dialeto e a marca *somente leitura*.

Quando a conexão falha, a sidebar mostra o motivo em um único cartão: a causa (usuário ou senha incorretos, servidor inacessível, tempo esgotado...) e, em fonte mono, a mensagem do próprio servidor (por exemplo `connect ECONNREFUSED 127.0.0.1:5432`). Corrija o que ela indica (suba o banco, confira host, porta ou credenciais) e clique em **Tentar novamente**, no cartão ou na barra de status; não é preciso recarregar a página.

## Turso (libSQL)

Escolha **SQLite / Turso**, defina *Local* como **Turso (remoto)** e informe a URL do banco (`libsql://meu-db-org.turso.io`) e um token de autenticação, ou cole `libsql://...?authToken=...` no campo de connection string. O token é guardado criptografado e nunca é exibido de novo. Um statement em execução não pode ser cancelado no servidor: *Cancelar* apenas para de esperar por ele.
