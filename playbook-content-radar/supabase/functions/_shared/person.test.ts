import { describe, expect, it } from 'vitest';
import {
  emailMatchesCompany, firstLastKey, fullNameKey, isCorporateEmail, isJunkName,
  nameSpecificity, normalizePersonName, phoneE164, stripProfileNoise,
} from './person.ts';

describe('person: normalização de nome', () => {
  it('limpa a poluição típica do full_name do LinkedIn', () => {
    expect(stripProfileNoise('Junior Bispo | Procurement')).toBe('Junior Bispo');
    expect(stripProfileNoise('Ana Costa - CEO na Playbook')).toBe('Ana Costa - CEO na Playbook');
    expect(stripProfileNoise('Léo Silva (Playbook Lab)')).toBe('Léo Silva');
    expect(stripProfileNoise('Marcos Reis 🚀')).toBe('Marcos Reis');
  });

  it('normaliza acento, caixa e espaço sobrando do Tally', () => {
    expect(normalizePersonName('  Priscila  Guimarães ')).toBe('priscila guimaraes');
    expect(normalizePersonName('JOÃO Jungbluth')).toBe('joao jungbluth');
  });

  it('remove partículas para casar "Samuel da Silva" com "Samuel Silva"', () => {
    expect(fullNameKey('Samuel da Silva')).toBe('samuel silva');
    expect(fullNameKey('LUCAS BRITO DE OLIVEIRA')).toBe('lucas brito oliveira');
  });

  it('gera chave fraca de primeiro + último para achar candidato', () => {
    expect(firstLastKey('LUCAS BRITO DE OLIVEIRA')).toBe('lucas oliveira');
    expect(firstLastKey('Tiago Lorenzetti Canatelli')).toBe('tiago canatelli');
  });

  it('mede especificidade do nome, que decide se ele basta sozinho', () => {
    expect(nameSpecificity('Joao Silva')).toBe(2);
    expect(nameSpecificity('Tiago Lorenzetti Canatelli')).toBe(3);
    expect(nameSpecificity('Cláudio Márcio Ramos Silva')).toBe(4);
  });
});

describe('person: lixo de formulário', () => {
  it('descarta os casos reais medidos no export do Tally', () => {
    expect(isJunkName('X', 'X')).toBe(true);
    expect(isJunkName('Q', 'Q')).toBe(true);
    expect(isJunkName('Jo', 'Jo')).toBe(true);
    expect(isJunkName('NF', 'F')).toBe(true);
    expect(isJunkName('FELIPE', 'teste')).toBe(true);
    expect(isJunkName('Daniel', 'sdaniel22.ds@gmail.com')).toBe(true);
    expect(isJunkName('', '')).toBe(true);
  });

  it('não descarta nome curto legítimo com sobrenome real', () => {
    expect(isJunkName('Ana', 'Jardim')).toBe(false);
    expect(isJunkName('Fe', 'Magalhães')).toBe(false);
  });
});

describe('person: telefone', () => {
  it('mantém o E.164 que o Tally já entrega', () => {
    expect(phoneE164('+5511992946933')).toBe('+5511992946933');
    expect(phoneE164('+5542991575683')).toBe('+5542991575683');
  });

  it('assume Brasil quando vem só DDD + número', () => {
    expect(phoneE164('(11) 99294-6933')).toBe('+5511992946933');
    expect(phoneE164('11992946933')).toBe('+5511992946933');
  });

  it('rejeita vazio e número sem DDD', () => {
    expect(phoneE164('')).toBe('');
    expect(phoneE164('99294-6933')).toBe('');
    expect(phoneE164('abc')).toBe('');
  });
});

describe('person: e-mail como eixo de identidade', () => {
  it('separa e-mail corporativo de provedor pessoal', () => {
    expect(isCorporateEmail('lucas.camargo@cbrdoc.com.br')).toBe(true);
    expect(isCorporateEmail('alisson@solucoesmw.com.br')).toBe(true);
    expect(isCorporateEmail('fereservas@gmail.com')).toBe(false);
    expect(isCorporateEmail('scbrianti2022@yahoo.com.br')).toBe(false);
    expect(isCorporateEmail('')).toBe(false);
  });

  it('corrobora identidade quando o domínio casa com a empresa do lead', () => {
    expect(emailMatchesCompany('lucas@cbrdoc.com.br', 'CBRdoc', null)).toBe(true);
    expect(emailMatchesCompany('ana@umbler.com', null, 'https://www.umbler.com/br')).toBe(true);
    expect(emailMatchesCompany('ana@outraempresa.com', 'Umbler', 'https://umbler.com')).toBe(false);
  });

  it('nunca corrobora a partir de e-mail pessoal', () => {
    expect(emailMatchesCompany('roger@gmail.com', 'Gmail Brasil', null)).toBe(false);
  });
});
