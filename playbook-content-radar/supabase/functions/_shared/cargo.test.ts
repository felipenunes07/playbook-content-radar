import { describe, expect, it } from 'vitest';
import { cargoJaReprova } from './cargo.ts';

// Este corte existe para não comprar a empresa (nem gastar LLM) de quem a regra dura
// já reprova pelo cargo. Ele só pode cortar o que o veredito final cortaria de
// qualquer jeito — cortar a mais é perder lead bom e ninguém percebe.
describe('cargoJaReprova: só corta o que a regra dura já reprovaria', () => {
  it('corta cargo operacional puro', () => {
    for (const cargo of [
      'SDR', 'BDR', 'Analista de Marketing', 'Assistente Comercial',
      'Estagiário de Vendas', 'Inside Sales', 'Auxiliar Administrativo',
      'Business Development Representative', 'Pré-vendas',
    ]) {
      expect(cargoJaReprova(cargo, null), cargo).toBe(true);
    }
  });

  it('NÃO corta quem lidera, mesmo com palavra barrada no cargo', () => {
    // "Coordenador de Vendas e SDR" não pode morrer por conter SDR.
    for (const cargo of [
      'Head de Pré-vendas', 'Gerente de Inside Sales', 'Diretor Comercial',
      'CEO', 'Founder', 'Sócio', 'Sales Manager',
      'Senior Manager, Sales Development', 'VP of Sales',
    ]) {
      expect(cargoJaReprova(cargo, null), cargo).toBe(false);
    }
  });

  it('NÃO corta a faixa cinzenta — coordenação e liderança de time decidem no modelo', () => {
    for (const cargo of [
      'Coordenador de SDR', 'Coordenadora de Pré-Vendas Inbound & Outbound',
      'Supervisor de Vendas', 'Líder de Inside Sales', 'Team Lead de BDR',
    ]) {
      expect(cargoJaReprova(cargo, null), cargo).toBe(false);
    }
  });

  it('Account/Product/Project Manager continua sendo individual contributor', () => {
    // "manager" nesses títulos não é liderança — mas também não há palavra barrada,
    // então o corte não se aplica e quem decide é o modelo.
    expect(cargoJaReprova('Account Manager', null)).toBe(false);
    // Já "Account Manager | SDR" tem palavra barrada E o manager não conta:
    expect(cargoJaReprova('Account Manager e SDR', null)).toBe(true);
  });

  it('cargo vazio nunca corta — sem dado não se decide nada', () => {
    expect(cargoJaReprova(null, null)).toBe(false);
    expect(cargoJaReprova('', '')).toBe(false);
    expect(cargoJaReprova('   ', null)).toBe(false);
  });

  it('cai no headline só quando não há cargo do perfil', () => {
    expect(cargoJaReprova(null, 'Analista de Dados')).toBe(true);
    // E o cargo real manda sobre o headline: é por isso que o corte roda DEPOIS do
    // perfil. Caso medido: headline "Inside Sales", cargo real "Sales Manager".
    expect(cargoJaReprova('Sales Manager', 'Inside Sales | Process Management')).toBe(false);
    expect(cargoJaReprova('Co-Founder', 'Business Analyst | Product Operations')).toBe(false);
    expect(cargoJaReprova('Fundador e Growth Hacker', 'Designer | Data Analyst | Power BI')).toBe(false);
  });
});
