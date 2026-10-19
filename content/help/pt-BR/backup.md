---
title: Backup e restauração
description: Faça dump de um banco em SQL, restaure um arquivo SQL, copie um arquivo SQLite e leve o próprio DbLocal para outra máquina.
category: Dados
order: 9
related: [connections, sql-editor, schema-browser]
---

# Backup e restauração

O DbLocal faz backup de um banco sem `pg_dump` nem `mysqldump`: ele mesmo lê o schema e as linhas e escreve um arquivo `.sql` que consegue rodar de novo. Abra pelo botão de backup no card da conexão, pelo **Mais** na barra superior ou com <kbd>⌘</kbd><kbd>K</kbd> → *Fazer backup da conexão*.

## Dump SQL {#dump}

**Dump em SQL…** baixa um schema (Postgres) ou banco (MySQL, SQLite) como SQL:

- **Estrutura**: tabelas com chaves, índices e chaves estrangeiras, tipos enum do Postgres, views, funções, procedures e triggers.
- **Dados**: todas as linhas, em `INSERT`s de 100 linhas, lidas página a página para uma tabela grande nunca ficar inteira na memória.
- **Só algumas tabelas** faz dump das tabelas marcadas (e seus triggers); views e rotinas ficam de fora nesse caso.

Os nomes das tabelas vão sem schema, então o arquivo restaura no schema ou banco que você escolher. As chaves estrangeiras entram depois das linhas (Postgres, MySQL) ou ficam desligadas durante a carga (SQLite), então a ordem das linhas nunca as quebra; as sequences de identity do Postgres avançam além dos ids carregados, e os triggers são criados por último para não dispararem nas linhas carregadas.

> [!NOTE]
> O dump é a visão portátil do DbLocal sobre o schema: não leva grants, extensões, sequences usadas em outro lugar, partições nem configurações do servidor. Para uma cópia completa de um servidor, use as ferramentas do próprio banco.

## Cópia do arquivo SQLite {#sqlite-file}

Numa conexão de arquivo SQLite o diálogo tem também **Baixar arquivo .sqlite**: uma cópia exata feita com o backup online do SQLite, segura com o arquivo em uso.

## Restaurar {#restore}

**Restaurar de SQL…** roda um arquivo `.sql` (um dump do DbLocal ou qualquer script) no schema ou banco escolhido, comando por comando, com barra de progresso. Antes, duas checagens: **Revisar** lê o arquivo e diz quantos comandos vão rodar e onde, listando os destrutivos (`DROP`, `TRUNCATE`, `DELETE` sem `WHERE`, ...); depois **Restaurar** só liga quando você digita o nome da conexão. Para no primeiro erro e mostra o comando e a mensagem do banco; o que rodou antes fica. Restaure um dump num schema ou banco vazio: ele cria as tabelas.

> [!WARNING]
> Conexões somente leitura não restauram, e o servidor recusa uma restauração não confirmada. Os comandos de uma restauração não entram no histórico de queries.

## Backup do workspace {#workspace}

Em **Configurações → Backup do workspace**, **Exportar** salva os dados do próprio DbLocal num arquivo `.json`: conexões, queries salvas, relações virtuais, notas, layouts do diagrama e ajustes do grid, e opcionalmente o histórico de queries.

- Com uma **senha** (8 caracteres ou mais), as senhas e chaves das conexões são cifradas com ela (scrypt e AES-256-GCM), então o arquivo funciona em outra máquina, qualquer que seja o `secret.key` dela.
- Sem senha, os segredos ficam de fora: as conexões de servidor pedem a senha de novo depois da importação.

**Importar** mescla um backup nesta instalação: itens com o mesmo id são substituídos, o resto é mantido.
