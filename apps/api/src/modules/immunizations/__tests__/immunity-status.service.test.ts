import { calculateImmunityStatus } from '../immunity-status.service';

function dose(vaccineCode: string, doseNumber: number, administeredDate: string) {
  return { vaccineCode, doseNumber, administeredDate: new Date(administeredDate) };
}

describe('calculateImmunityStatus', () => {
  it('marks a child below minimum age as not_eligible', () => {
    const statuses = calculateImmunityStatus(
      '2025-01-15', // newborn
      [],
      undefined,
      new Date('2025-02-15') // 1 month old
    );

    const mmr = statuses.find((s) => s.vaccineName === 'MMR');
    expect(mmr?.status).toBe('not_eligible');
  });

  it('marks an age-eligible child with no doses as not_started', () => {
    const statuses = calculateImmunityStatus(
      '2020-01-15',
      [],
      undefined,
      new Date('2021-05-01') // 16 months old
    );

    const mmr = statuses.find((s) => s.vaccineName === 'MMR');
    expect(mmr?.status).toBe('not_started');
    expect(mmr?.dosesReceived).toBe(0);
    expect(mmr?.seriesTotal).toBe(2);
  });

  it('marks a fully vaccinated child as immune', () => {
    const statuses = calculateImmunityStatus(
      '2015-01-15',
      [dose('03', 1, '2016-02-01'), dose('03', 2, '2019-06-01')],
      undefined,
      new Date('2021-01-15') // 6 years old
    );

    const mmr = statuses.find((s) => s.vaccineCode === '03');
    expect(mmr?.status).toBe('immune');
    expect(mmr?.seriesComplete).toBe(true);
  });

  it('marks a partially vaccinated child whose next dose is overdue', () => {
    const statuses = calculateImmunityStatus(
      '2014-01-15',
      [dose('03', 1, '2015-02-01')],
      undefined,
      new Date('2021-01-15') // 7 years old, dose 2 max age 72 months
    );

    const mmr = statuses.find((s) => s.vaccineCode === '03');
    expect(mmr?.status).toBe('overdue');
    expect(mmr?.seriesComplete).toBe(false);
  });

  it('marks a partial series with next dose due as due', () => {
    const statuses = calculateImmunityStatus(
      '2019-01-15',
      [dose('03', 1, '2020-02-01')],
      undefined,
      new Date('2023-01-15') // 4 years old, dose 2 due window 48-72 months
    );

    const mmr = statuses.find((s) => s.vaccineCode === '03');
    expect(mmr?.status).toBe('due');
  });

  it('treats influenza as an annual booster — due after a year', () => {
    const statuses = calculateImmunityStatus(
      '1990-01-15',
      [dose('88', 1, '2024-10-01')],
      undefined,
      new Date('2026-01-15') // >365 days since last flu shot
    );

    const flu = statuses.find((s) => s.vaccineCode === '88');
    expect(flu?.status).toBe('due');
    expect(flu?.boosterWindowDays).toBe(365);
  });

  it('keeps influenza immune within the annual window', () => {
    const statuses = calculateImmunityStatus(
      '1990-01-15',
      [dose('88', 1, '2025-10-01')],
      undefined,
      new Date('2026-01-15') // ~3 months since last flu shot
    );

    const flu = statuses.find((s) => s.vaccineCode === '88');
    expect(flu?.status).toBe('immune');
  });

  it('treats Td as a 10-year booster', () => {
    const statuses = calculateImmunityStatus(
      '1980-01-15',
      [dose('113', 1, '2010-06-01')],
      undefined,
      new Date('2025-01-15') // ~14 years since last Td
    );

    const td = statuses.find((s) => s.vaccineCode === '113');
    expect(td?.status).toBe('due');
    expect(td?.boosterWindowDays).toBe(3650);
  });

  it('excludes travel vaccines from routine status', () => {
    const statuses = calculateImmunityStatus('1990-01-15', []);
    expect(statuses.some((s) => s.vaccineName === 'Typhoid')).toBe(false);
  });

  it('sorts results by vaccine name', () => {
    const statuses = calculateImmunityStatus('2020-01-15', []);
    const names = statuses.map((s) => s.vaccineName);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });
});
