const assert = require('assert');
const SQLParser = require('../js/SQLParser');
const MigrationGenerator = require('../js/MigrationGenerator');

function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function maybe(rand, chance = 0.5) {
  return rand() < chance;
}

function buildCase(seed) {
  const rand = mulberry32(seed * 131);
  const baseName = `ppg_idx_${seed}`;
  const finalName = maybe(rand, 0.35) ? `${baseName}_final` : baseName;
  const dropExpressionIndex = maybe(rand, 0.8);

  const lines = [
    'BEGIN;',
    `CREATE TABLE public.${baseName} (`,
    '  id bigserial NOT NULL,',
    '  email character varying(190) NOT NULL,',
    '  deleted_at timestamp with time zone NULL,',
    '  created_at timestamp with time zone NULL,',
    '  updated_at timestamp with time zone NULL',
    ');',
    `ALTER TABLE ONLY public.${baseName} ADD CONSTRAINT ${baseName}_pkey PRIMARY KEY (id);`,
    `CREATE UNIQUE INDEX ${baseName}_email_live_unique ON public.${baseName} (lower(email)) WHERE deleted_at IS NULL;`,
    `CREATE INDEX ${baseName}_email_search_idx ON public.${baseName} USING gin (to_tsvector('english', coalesce(email, '')));`
  ];

  if (dropExpressionIndex) {
    lines.push(`DROP INDEX ${baseName}_email_search_idx;`);
  }

  if (finalName !== baseName) {
    lines.push(`ALTER TABLE ONLY public.${baseName} RENAME TO ${finalName};`);
  }

  lines.push('COMMIT;');

  return {
    baseName,
    finalName,
    dropExpressionIndex,
    sql: lines.join('\n')
  };
}

function runCase(seed) {
  const scenario = buildCase(seed);
  const parsed = SQLParser.parseSQLContent(scenario.sql);
  const table = parsed.tables[scenario.finalName];

  assert(table, `seed ${seed}: missing parsed table ${scenario.finalName}`);
  assert(table.columns.id?.autoIncrement, `seed ${seed}: id should auto increment`);
  assert(table.columns.email, `seed ${seed}: missing email`);
  assert(table.columns.deleted_at, `seed ${seed}: missing deleted_at`);
  assert(table.rawStatements?.some(stmt => stmt.includes(`${scenario.baseName}_email_live_unique`)), `seed ${seed}: partial unique should be preserved as raw statement`);

  if (scenario.dropExpressionIndex) {
    assert(!table.rawStatements?.some(stmt => stmt.includes(`${scenario.baseName}_email_search_idx`)), `seed ${seed}: dropped expression index should not remain`);
  } else {
    assert(table.rawStatements?.some(stmt => stmt.includes(`${scenario.baseName}_email_search_idx`)), `seed ${seed}: expression index should remain when not dropped`);
  }

  const migration = MigrationGenerator.generate(scenario.finalName, table, {
    laravelVersion: 13,
    dbDriver: 'pgsql',
    dbVersion: '15.0'
  });

  assert(migration, `seed ${seed}: missing migration`);
  assert(migration.includes("DB::statement('CREATE UNIQUE INDEX"), `seed ${seed}: missing raw unique index statement`);
  assert(migration.includes("$table->softDeletesTz();"), `seed ${seed}: expected soft deletes tz helper`);
  if (scenario.dropExpressionIndex) {
    assert(!migration.includes(`${scenario.baseName}_email_search_idx`), `seed ${seed}: dropped expression index should not be emitted`);
  } else {
    assert(migration.includes(`${scenario.baseName}_email_search_idx`), `seed ${seed}: expression index should be emitted when not dropped`);
  }
}

const RUNS = 250;
for (let seed = 1; seed <= RUNS; seed++) {
  runCase(seed);
}

console.log(`partial index fuzz ok: ${RUNS} seeds`);
