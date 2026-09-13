# Ecossistema RENOVA

Reestruturação oficial do Ecossistema RENOVA.

## Stack
- Next.js 16 (Active LTS)
- Supabase Auth + PostgreSQL + RLS
- GitHub como fonte oficial do código
- NextGo como camada pública/publicação

## Ambientes oficiais
- GitHub: `ecossistema-renova/ecossistemarenova`
- Supabase Project Ref: `epbhiygonpkzlmbbsyqv`

## Arquitetura

`Usuário → NextGo → aplicação Next.js → Supabase`

O GitHub mantém código, documentação, migrations e histórico técnico.

## Princípios

**Segurança → Integridade dos dados → Funcionamento → Integração → Performance → Experiência visual → Escala.**

## Segurança

Nunca versionar chaves privadas, `service_role`, access tokens, senhas ou arquivos de ambiente com segredos. O frontend usa apenas URL do projeto e chave publicável do Supabase.
