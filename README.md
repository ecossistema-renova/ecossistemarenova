# OYAG Ecosystem

Aplicação web oficial publicada do OYAG Ecosystem.

## Stack
- HTML, CSS e JavaScript modular
- Supabase Auth + PostgreSQL + RLS
- GitHub como fonte oficial, versionamento e GitHub Pages
- Domínio próprio OYAG

## Ambiente
- Repositório: `oyag-ecosystem/oyag-ecosystem`
- Domínio: `https://oyag.cledemilsonoliveira.com`
- Supabase Project Ref: `epbhiygonpkzlmbbsyqv`
- Branch `gh-pages`: publicação web

## Arquitetura

`Usuário → oyag.cledemilsonoliveira.com → GitHub Pages → Supabase`

## Segurança

Nunca versionar chaves privadas, `service_role`, access tokens ou senhas. O frontend usa somente a URL do projeto e a chave publicável do Supabase. Autorização é aplicada por RLS e funções controladas no banco.

## Produção

A branch `gh-pages` é o ambiente web publicado do OYAG Ecosystem.
