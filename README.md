# OYAG Ecosystem

Aplicação web oficial em homologação do OYAG Ecosystem.

## Stack
- HTML, CSS e JavaScript modular
- Supabase Auth + PostgreSQL + RLS
- GitHub como fonte oficial, versionamento e GitHub Pages
- NextGo como container de exibição via iframe

## Ambiente
- Repositório: `ecossistema-renova/ecossistemarenova`
- Supabase Project Ref: `epbhiygonpkzlmbbsyqv`
- Branch `gh-pages`: homologação

## Arquitetura
`Usuário → NextGo → iframe → GitHub Pages → Supabase`

## Segurança
Nunca versionar chaves privadas, `service_role`, access tokens ou senhas. O frontend usa somente a URL do projeto e a chave publicável do Supabase. Autorização é aplicada por RLS e funções controladas no banco.

## Produção
A homologação não deve ser tratada como produção. A publicação definitiva exige aprovação expressa do proprietário após os testes integrados.
