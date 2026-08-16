-- ----------------------------------------------------------------------------
-- Importação em massa de chave PIX + tipo pra membros que o Vitor já tinha
-- os dados anotados fora do sistema. Tipo (CPF x PHONE) inferido pelo
-- dígito verificador do CPF pra número de 11 dígitos sem formatação
-- (CPF e celular com DDD têm o mesmo tamanho no Brasil) -- os que batem no
-- checksum do CPF foram marcados CPF, os que não batem e têm cara de
-- DDD+celular foram marcados PHONE. "VANEER" não tem membro correspondente
-- no sistema, não entra aqui.
-- ----------------------------------------------------------------------------
update members set pix_key = data.pix_key, pix_key_type = data.pix_key_type
from (values
  ('EVY', '51999916152', 'PHONE'),
  ('DOUUG', '11951983667', 'PHONE'),
  ('VICTOR', '06673096241', 'CPF'),
  ('NEPHILIM', '11945940519', 'PHONE'),
  ('ALLGAYER', '48803004890', 'CPF'),
  ('NAAN', 'zplaying645@gmail.com', 'EMAIL'),
  ('KEVYN', '40685697894', 'CPF'),
  ('PALTRINIERI', '11940168686', 'PHONE'),
  ('LEAL', '11962841787', 'PHONE'),
  ('UNDER', '02522654080', 'CPF'),
  ('TIAGO', '02308358211', 'CPF'),
  ('WORVIS', 'wxrvis@gmail.com', 'EMAIL'),
  ('SAKAI', '34705394801', 'CPF'),
  ('FREITAZ', '11931458015', 'PHONE'),
  ('LADYMARIE', 'marianahess1515@gmail.com', 'EMAIL'),
  ('BRUNINHO', '19989155477', 'PHONE'),
  ('GAMA', '50671254898', 'CPF'),
  ('PARADISE', 'davissgt1@hotmail.com', 'EMAIL'),
  ('ERRADO', '21c53d4a-a16b-4b93-8c8e-8c6de5d02fd8', 'EVP'),
  ('LIANO', 'wandersonlian77@gmail.com', 'EMAIL'),
  ('MAISA', '34997909690', 'PHONE'),
  ('ALISONNXZ', '44671769859', 'CPF'),
  ('GURIDOLOW', '14494174696', 'CPF'),
  ('MAOU', 'samuelsabinowolf@gmail.com', 'EMAIL')
) as data(coupon_code, pix_key, pix_key_type)
where members.coupon_code ilike data.coupon_code;
