-- =====================================================
-- ASX Price Monitor — Seed: 8 Revendedores ASX
-- Execute no SQL Editor do Supabase APÓS a migration
-- =====================================================

-- Limpar dados antigos (se existirem)
DELETE FROM clientes;

-- Inserir os 8 revendedores da planilha com dados corretos
INSERT INTO clientes (nome, seller_id, loja_ml, link_loja, status, total_produtos, total_violacoes, "createdAt", "updatedAt")
VALUES
  ('LS DISTRIBUIDORA',        '241146691',  'ls-distribuidora',    'https://www.mercadolivre.com.br/loja/ls-distribuidora',             'ativo', 0, 0, NOW(), NOW()),
  ('GLOBALPARTS1',            '1917431909', 'globalparts1',        'https://www.mercadolivre.com.br/pagina/globalparts1',               'ativo', 0, 0, NOW(), NOW()),
  ('CSRPARTS',                '1229968748', 'csrparts',            'https://www.mercadolivre.com.br/pagina/csrparts',                   'ativo', 0, 0, NOW(), NOW()),
  ('BERTO PARTS',             '255978756',  'berto-parts',         'https://lista.mercadolivre.com.br/_CustId_255978756',               'ativo', 0, 0, NOW(), NOW()),
  ('TECNOAUDIO ELETRONICA',   '186722996',  'extremesom',          'https://www.mercadolivre.com.br/pagina/extremesom',                 'ativo', 0, 0, NOW(), NOW()),
  ('ACESSORIOSPARACAMINHAO',  '1712320386', 'acessorios-para-caminhao', 'https://lista.mercadolivre.com.br/_CustId_1712320386',         'ativo', 0, 0, NOW(), NOW()),
  ('IMPERIAL LED',            '1116226805', 'imperialled4886',     'https://www.mercadolivre.com.br/pagina/imperialled4886',            'ativo', 0, 0, NOW(), NOW()),
  ('COMBATSOM',               '287896166',  'combatsom',           'https://www.mercadolivre.com.br/pagina/combatsom',                  'ativo', 0, 0, NOW(), NOW());

-- Verificar
SELECT id, nome, seller_id, loja_ml, status FROM clientes ORDER BY id;
