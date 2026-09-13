// Genetic algorithm timetable generator.
//
// Each "session slot" is one occurrence that needs a (day, startHour, room)
// assigned — a ScheduleSection with sessionsPerWeek=3 produces 3 slots.
// A chromosome is one array of assignments, one per slot, in the same
// order as `slots`. Fitness = weighted count of constraint violations
// (lower is better, 0 = perfect schedule).

export type Slot = {
  slotIndex: number;
  scheduleSectionId: string;
  courseId: string;
  batchId: string;
  instructorId: string;
  roomTypeNeeded: string;
  durationHours: number;
  studentCount: number;
  allowedDays: string[];
  dayStartHour: number;
  dayEndHour: number;
};

export type Room = { id: string; type: string; capacity: number };
export type Unavailability = { facultyId: string; dayOfWeek: string; startHour: number; endHour: number };

export type Gene = { day: string; startHour: number; roomId: string };

const HARD_PENALTY = 1000;
const TIME_STEP = 0.5; // half-hour granularity

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomGene(slot: Slot, rooms: Room[]): Gene {
  const day = randomChoice(slot.allowedDays.length > 0 ? slot.allowedDays : ["Mon"]);
  const usableRooms = rooms.filter((r) => r.type === slot.roomTypeNeeded && r.capacity >= slot.studentCount);
  const room = usableRooms.length > 0 ? randomChoice(usableRooms) : randomChoice(rooms);
  const latestStart = Math.max(slot.dayStartHour, slot.dayEndHour - slot.durationHours);
  const steps = Math.max(1, Math.floor((latestStart - slot.dayStartHour) / TIME_STEP));
  const startHour = slot.dayStartHour + Math.floor(Math.random() * (steps + 1)) * TIME_STEP;
  return { day, startHour, roomId: room?.id || rooms[0]?.id };
}

function fitness(chromosome: Gene[], slots: Slot[], rooms: Room[], unavailability: Unavailability[]): { score: number; hardViolations: number } {
  let score = 0, hardViolations = 0;
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i], gene = chromosome[i];
    const room = roomById.get(gene.roomId);
    const end = gene.startHour + slot.durationHours;

    if (!slot.allowedDays.includes(gene.day)) { score += HARD_PENALTY; hardViolations++; }
    if (gene.startHour < slot.dayStartHour || end > slot.dayEndHour) { score += HARD_PENALTY; hardViolations++; }
    if (!room || room.type !== slot.roomTypeNeeded) { score += HARD_PENALTY; hardViolations++; }
    if (room && room.capacity < slot.studentCount) { score += HARD_PENALTY; hardViolations++; }

    for (const u of unavailability) {
      if (u.facultyId === slot.instructorId && u.dayOfWeek === gene.day && overlaps(gene.startHour, end, u.startHour, u.endHour)) {
        score += HARD_PENALTY; hardViolations++;
      }
    }

    for (let j = i + 1; j < slots.length; j++) {
      const other = slots[j], otherGene = chromosome[j];
      if (otherGene.day !== gene.day) continue;
      const otherEnd = otherGene.startHour + other.durationHours;
      if (!overlaps(gene.startHour, end, otherGene.startHour, otherEnd)) continue;

      if (other.instructorId === slot.instructorId) { score += HARD_PENALTY; hardViolations++; }
      if (otherGene.roomId === gene.roomId) { score += HARD_PENALTY; hardViolations++; }
      if (other.batchId === slot.batchId) { score += HARD_PENALTY; hardViolations++; }
      if (other.scheduleSectionId === slot.scheduleSectionId && otherGene.day === gene.day) { score += HARD_PENALTY / 2; hardViolations++; }
    }
  }

  // Soft: penalize gaps within a batch's day (encourages compact schedules).
  const byBatchDay = new Map<string, number[]>();
  for (let i = 0; i < slots.length; i++) {
    const key = `${slots[i].batchId}::${chromosome[i].day}`;
    const arr = byBatchDay.get(key) || [];
    arr.push(chromosome[i].startHour);
    byBatchDay.set(key, arr);
  }
  for (const starts of byBatchDay.values()) {
    if (starts.length < 2) continue;
    const sorted = [...starts].sort((a, b) => a - b);
    for (let k = 1; k < sorted.length; k++) {
      const gap = sorted[k] - sorted[k - 1];
      if (gap > 1) score += Math.min(gap, 4); // soft penalty, capped
    }
  }

  return { score, hardViolations };
}

function crossover(a: Gene[], b: Gene[]): Gene[] {
  const point = Math.floor(Math.random() * a.length);
  return a.map((g, i) => (i < point ? g : b[i]));
}

function mutate(chromosome: Gene[], slots: Slot[], rooms: Room[], rate: number): Gene[] {
  return chromosome.map((g, i) => (Math.random() < rate ? randomGene(slots[i], rooms) : g));
}

export function runGeneticAlgorithm(slots: Slot[], rooms: Room[], unavailability: Unavailability[], opts: { populationSize?: number; maxGenerations?: number; timeBudgetMs?: number; seed?: Gene[] } = {}) {
  const populationSize = opts.populationSize ?? 40;
  const maxGenerations = opts.maxGenerations ?? 150;
  const timeBudgetMs = opts.timeBudgetMs ?? 8000;
  const startTime = Date.now();

  if (slots.length === 0) return { chromosome: [] as Gene[], score: 0, hardViolations: 0, generations: 0 };

  // Seed a valid-length chromosome from a previous chunk's best, if given
  // (and the slot count still matches — it won't if sections changed).
  const validSeed = opts.seed && opts.seed.length === slots.length ? opts.seed : null;

  let population: Gene[][] = Array.from({ length: populationSize }, (_, i) =>
    i === 0 && validSeed ? validSeed : slots.map((s) => randomGene(s, rooms))
  );
  let best = population[0], bestFit = fitness(best, slots, rooms, unavailability);
  let gen = 0;

  for (; gen < maxGenerations; gen++) {
    if (Date.now() - startTime > timeBudgetMs) break;

    const scored = population.map((c) => ({ c, f: fitness(c, slots, rooms, unavailability) }));
    scored.sort((a, b) => a.f.score - b.f.score);
    if (scored[0].f.score < bestFit.score) { best = scored[0].c; bestFit = scored[0].f; }
    if (bestFit.hardViolations === 0 && bestFit.score < 1) break; // essentially perfect

    const survivors = scored.slice(0, Math.max(2, Math.floor(populationSize / 2))).map((s) => s.c);
    const nextGen: Gene[][] = [best]; // elitism
    while (nextGen.length < populationSize) {
      const p1 = randomChoice(survivors), p2 = randomChoice(survivors);
      const child = mutate(crossover(p1, p2), slots, rooms, 0.08);
      nextGen.push(child);
    }
    population = nextGen;
  }

  return { chromosome: best, score: bestFit.score, hardViolations: bestFit.hardViolations, generations: gen };
}
