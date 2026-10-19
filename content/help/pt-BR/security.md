---
title: Segurança
description: O que o DbLocal protege, o que não protege e como usá-lo com segurança.
category: Referência
order: 12
related: [docker-cli, connections]
---

# Segurança

O DbLocal é uma ferramenta para a sua própria máquina. Estas são as escolhas que o mantêm assim.

## Local por padrão {#local}

Ele escuta em `127.0.0.1`, então só o seu computador o alcança. Escutar em qualquer outro endereço sem senha mostra um aviso no app.

## Senha {#password}

Defina `DBLOCAL_PASSWORD` para exigir login. A sessão é um cookie httpOnly, as tentativas de login são limitadas (cinco por minuto por endereço) e requisições de outra origem são recusadas.

> [!DANGER]
> Quem consegue abrir o DbLocal usa todas as conexões salvas. Se for expô-lo além da sua máquina, defina uma senha e coloque-o atrás de TLS.

## Segredos {#secrets}

Senhas, certificados SSL e chaves SSH são criptografados com AES-256-GCM antes de serem guardados, e a API nunca os devolve. A chave é gerada na primeira execução em `<data dir>/secret.key` (modo 600) ou vem de `DBLOCAL_SECRET`. Faça backup dela junto com `dblocal.db`: uma não serve sem a outra.

## Somente leitura e produção {#read-only}

- Marque uma conexão como **somente leitura**, ou inicie com `--readonly`: as escritas são recusadas pelo DbLocal e pela própria sessão do banco.
- Marque uma conexão como `prod`: salvar alterações pede que você digite o nome da conexão, e statements de escrita ou DDL no editor SQL pedem confirmação.

## Confirmação dupla de ações pesadas {#double-check}

Ações destrutivas (apagar tabelas ou colunas, `DELETE` / `UPDATE` sem `WHERE`, apagar linhas ao salvar, restaurar um dump) listam o que será destruído e pedem que você digite o nome da conexão. Desative em **Configurações → Segurança → Confirmação dupla de ações pesadas** para manter só o aviso. Escritas em conexões `prod` sempre pedem o nome, e o servidor recusa esses statements sem confirmação de qualquer forma.

## Demo e tour {#demo}

O banco de demonstração é um arquivo SQLite separado no diretório de dados. O tour só roda nele, e **Resetar demo** o restaura. Nenhum dos dois toca nos seus bancos.
