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
  const rand = mulberry32(seed * 101);
  const usePg = seed % 2 === 1;
  const tableName = usePg ? `cif_pg_${seed}` : `cif_my_${seed}`;
  const emailUnique = maybe(rand, 0.8);
  const codeUnique = maybe(rand, 0.7);
  const accountIndexDropped = maybe(rand, 0.6);
  const rename = maybe(rand, 0.4);
  const finalName = rename ? `${tableName}_final` : tableName;

  const lines = [];

  if (usePg) {
    lines.push('SET statement_timeout = 0;');
    lines.push('BEGIN;');
    lines.push(`CREATE TABLE public.${tableName} (`);
    lines.push('  id bigserial NOT NULL,');
    lines.push('  email character varying(180) NOT NULL,');
    lines.push('  account_id bigint,');
    lines.push('  code character varying(60) NOT NULL,');
    lines.push('  created_at timestamp with time zone NULL,');
    lines.push('  updated_at timestamp with time zone NULL');
    lines.push(');');
    lines.push(`ALTER TABLE ONLY public.${tableName} ADD CONSTRAINT ${tableName}_pkey PRIMARY KEY (id);`);
    if (emailUnique) {
      lines.push(`CREATE UNIQUE INDEX ${tableName}_email_unique ON public.${tableName} (email);`);
    }
    if (codeUnique) {
      lines.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${tableName}_code_unique ON public.${tableName} (code);`);
    }
    lines.push(`CREATE INDEX ${tableName}_account_id_index ON public.${tableName} (account_id);`);
    if (rename) {
      lines.push(`ALTER TABLE ONLY public.${tableName} RENAME TO ${finalName};`);
    }
    if (accountIndexDropped) {
      lines.push(`DROP INDEX ${tableName}_account_id_index;`);
    }
    lines.push('COMMIT;');
  } else {
    lines.push('START TRANSACTION;');
    lines.push(`CREATE TABLE \`${tableName}\` (`);
    lines.push('  `id` bigint unsigned NOT NULL,');
    lines.push('  `email` varchar(180) NOT NULL,');
    lines.push('  `account_id` bigint unsigned DEFAULT NULL,');
    lines.push('  `code` varchar(60) NOT NULL,');
    lines.push('  `created_at` timestamp NULL DEFAULT NULL,');
    lines.push('  `updated_at` timestamp NULL DEFAULT NULL');
    lines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
    lines.push(`ALTER TABLE \`${tableName}\` ADD PRIMARY KEY (\`id\`);`);
    lines.push(`ALTER TABLE \`${tableName}\` MODIFY \`id\` bigint unsigned NOT NULL AUTO_INCREMENT;`);
    if (emailUnique) {
      lines.push(`CREATE UNIQUE INDEX \`${tableName}_email_unique\` ON \`${tableName}\` (\`email\`);`);
    }
    if (codeUnique) {
      lines.push(`CREATE UNIQUE INDEX \`${tableName}_code_unique\` ON \`${tableName}\` (\`code\`);`);
    }
    lines.push(`CREATE INDEX \`${tableName}_account_id_index\` ON \`${tableName}\` (\`account_id\`);`);
    if (rename) {
      lines.push(`ALTER TABLE \`${tableName}\` RENAME TO \`${finalName}\`;`);
    }
    if (accountIndexDropped) {
      lines.push(`DROP INDEX \`${tableName}_account_id_index\` ON \`${finalName}\`;`);
    }
    lines.push('COMMIT;');
  }

  return {
    parsedName: finalName,
    dbDriver: usePg ? 'pgsql' : 'mysql',
    dbVersion: usePg ? '15.0' : '8.4',
    emailUnique,
    codeUnique,
    accountIndexDropped,
    sql: lines.join('\n')
  };
}

function runCase(seed) {
  const scenario = buildCase(seed);
  const parsed = SQLParser.parseSQLContent(scenario.sql);
  const table = parsed.tables[scenario.parsedName];

  assert(table, `seed ${seed}: missing parsed table ${scenario.parsedName}`);
  assert(table.indexes.some(idx => /PRIMARY\s+KEY/i.test(idx)), `seed ${seed}: missing primary key`);

  if (scenario.emailUnique) {
    assert(table.indexes.some(idx => idx.includes('_email_unique')), `seed ${seed}: missing email unique index`);
  }
  if (scenario.codeUnique) {
    assert(table.indexes.some(idx => idx.includes('_code_unique')), `seed ${seed}: missing code unique index`);
  }
  if (scenario.accountIndexDropped) {
    assert(!table.indexes.some(idx => idx.includes('_account_id_index')), `seed ${seed}: dropped account index still present`);
  } else {
    assert(table.indexes.some(idx => idx.includes('_account_id_index')), `seed ${seed}: account index missing`);
  }

  const migration = MigrationGenerator.generate(scenario.parsedName, table, {
    laravelVersion: 13,
    dbDriver: scenario.dbDriver,
    dbVersion: scenario.dbVersion
  });

  assert(migration, `seed ${seed}: missing migration`);
  assert(!migration.includes('undefined'), `seed ${seed}: invalid migration`);
  assert(migration.includes("$table->string('email', 180)") || migration.includes("$table->string('email')"), `seed ${seed}: email column missing`);

  if (scenario.emailUnique) {
    assert(migration.includes("$table->string('email', 180)->unique();") || migration.includes("$table->string('email')->unique();"), `seed ${seed}: email should be unique`);
  }

  if (scenario.codeUnique) {
    assert(migration.includes("$table->string('code', 60)->unique();"), `seed ${seed}: code should be unique`);
  }

  if (scenario.accountIndexDropped) {
    assert(!migration.includes("account_id')->index()"), `seed ${seed}: dropped account index still emitted`);
  }
}

const RUNS = 250;
for (let seed = 1; seed <= RUNS; seed++) {
  runCase(seed);
}

console.log(`create index fuzz ok: ${RUNS} seeds`);
