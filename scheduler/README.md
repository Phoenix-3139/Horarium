# scheduler/

Pure-JS constraint solver that generates ranked schedule combinations.

## Structure (to be built in Phase 3)

```
scheduler/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts        # Public API: generate(requirements, preferences)
│   ├── solver.ts       # Backtracking CSP search
│   ├── conflicts.ts    # Pairwise section overlap logic
│   ├── score.ts        # Preference scoring
│   └── types.ts
└── test/
    └── solver.test.ts
```

## API sketch

```ts
import { generate } from './src/index.js';

const options = generate({
  required_courses: ['ENGR-UH 2011', 'ENGR-UH 2012', 'MATH-UH 1022'],
  catalog: loadedCatalog,  // parsed data/<term>.json
  preferences: {
    avoid_before: '09:00',
    avoid_after: '18:00',
    preferred_instructors: ['Sousa, Rita Leal'],
    weight_morning: 1.0,
    weight_lunch: 2.0,
  },
  top_n: 10,
});

// options: Array<{ sections: Section[], score: number, breakdown: {...} }>
```

## Algorithm

Backtracking DFS over the product of candidate section sets. Prune eagerly on
conflict. Apply scoring only to complete assignments. Return top N by score.

For the target problem size (5-6 courses × 2-4 sections each), enumeration
with good pruning runs in milliseconds. No need for a real SAT solver.

## Why no dependencies

The problem is small and the algorithm is textbook. Pulling in a CSP library
would add maintenance burden and opacity for zero speedup.
