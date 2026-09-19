# OYAG Ecosystem

Plataforma central oficial do OYAG Ecosystem.

## Stack
- GitHub como fonte oficial do código e histórico técnico
- GitHub Pages para publicação web atual
- Supabase Auth + PostgreSQL + RLS
- Domínio próprio sob controle do OYAG

## Ambientes oficiais
- Repositório público: `oyag-ecosystem/oyag-ecosystem`
- Repositório core: `oyag-ecosystem/oyag-ecosystem-core`
- Domínio público: `https://oyag.cledemilsonoliveira.com`
- Supabase Project Ref: `epbhiygonpkzlmbbsyqv`
- Branch de publicação atual: `gh-pages`

## Arquitetura

`Usuário → oyag.cledemilsonoliveira.com → GitHub Pages → Supabase`

O GitHub mantém código, documentação e histórico técnico. O Supabase fornece autenticação, banco de dados e políticas de acesso.

## Princípios

**Segurança → Integridade dos dados → Funcionamento → Integração → Performance → Experiência visual → Escala.**

## Segurança

Nunca versionar chaves privadas, `service_role`, access tokens, senhas ou arquivos de ambiente com segredos. O frontend usa apenas a URL do projeto e a chave publicável do Supabase.
