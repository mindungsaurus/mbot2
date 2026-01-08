//src/encounter/encounter.store.ts
import { Injectable } from '@nestjs/common';
import { EncounterState } from './encounter.types';

@Injectable()
export class EncounterStore {
  private map = new Map<string, EncounterState>();

  constructor() {
    // 샘플 하나 넣어두기
    const sample: EncounterState = {
      id: 'demo',
      updatedAt: new Date().toISOString(),
      units: [
        {
          id: 'namuA',
          side: 'TEAM',
          name: '(나무A)',
          hp: { cur: 20, max: 20, temp: 5 },
          ac: 15,
          integrity: 5,
          tags: [],
          colorCode: 32,
        },
        {
          id: 'xenon',
          side: 'TEAM',
          name: '제논',
          hp: { cur: 22, max: 41, temp: 2 },
          ac: 13,
          tags: ['위압됨', '사냥꾼의 표식', '출혈'],
          colorCode: 31,
        },
        {
          id: 'bard',
          side: 'ENEMY',
          name: '전승바드',
          note: '전승바드 : 방호의 서곡 , 고양의 합악',
          tags: [],
          colorCode: 30,
        },
        {
          id: 'war',
          side: 'ENEMY',
          name: '레벨5 워리어',
          hp: { cur: 10, max: 43 },
          ac: 14,
          tags: ['실명'],
          colorCode: 31,
        },
      ],
      turnOrder: [
        { kind: 'label', text: '레나' },
        { kind: 'label', text: '무리사냥꾼' },
        { kind: 'unit', unitId: 'xenon' },
        { kind: 'unit', unitId: 'war' },
      ],
      turnIndex: 0,
      formationLines: [
        '(드릴씨)                                              (the크라운)',
        '(나무A)--3--레나,텐트리--3--제논--3--워리어,무리---3(-----6----티아)---3---세토,괴수,바드,정령',
      ],
    };

    this.map.set(sample.id, sample);
  }

  get(id: string): EncounterState {
    const s = this.map.get(id);
    if (!s) throw new Error(`encounter not found: ${id}`);
    return s;
  }

  set(id: string, state: EncounterState) {
    this.map.set(id, state);
  }
}
