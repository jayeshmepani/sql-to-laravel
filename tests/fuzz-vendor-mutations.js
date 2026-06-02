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

function expectMigration(tableName, table, options) {
  const code = MigrationGenerator.generate(tableName, table, {
    laravelVersion: 13,
    ...options
  });

  assert(code, `${tableName}: missing migration`);
  assert(!code.includes('undefined'), `${tableName}: migration contains undefined`);
  return code;
}

function buildMySqlCase(seed) {
  const rand = mulberry32(seed * 17);
  const baseName = `mx_seed_${seed}`;
  const finalName = maybe(rand, 0.5) ? `${baseName}_final` : baseName;
  const expected = {
    finalName,
    mustHave: new Set(['id', 'code']),
    mustNotHave: new Set(),
    expectUniqueCode: true,
    expectFk: maybe(rand, 0.75),
    expectUuid: maybe(rand, 0.7),
    expectTimestamps: maybe(rand, 0.8)
  };

  const lines = [
    `DROP TABLE IF EXISTS \`${baseName}\`;`,
    `CREATE TABLE \`${baseName}\` (`,
    '  `id` bigint unsigned NOT NULL,',
    '  `code` varchar(90) NOT NULL,',
    '  `owner_id` bigint unsigned DEFAULT NULL,',
    expected.expectUuid ? '  `uuid` char(36) DEFAULT NULL,' : '  `legacy_uuid` char(36) DEFAULT NULL,',
    '  `payload` longtext DEFAULT NULL,',
    '  `flag` tinyint(1) NOT NULL DEFAULT \'1\'',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    `ALTER TABLE \`${baseName}\``,
    '  ADD PRIMARY KEY (`id`),',
    `  ADD UNIQUE KEY \`${baseName}_code_unique\` (\`code\`),`,
    '  ADD KEY `tmp_owner_idx` (`owner_id`);',
    `ALTER TABLE \`${baseName}\``,
    '  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  CHANGE `payload` `meta` longtext NULL,',
    '  DROP COLUMN `flag`;',
    `DROP INDEX \`tmp_owner_idx\` ON \`${baseName}\`;`
  ];

  expected.mustHave.add('meta');
  expected.mustNotHave.add('payload');
  expected.mustNotHave.add('flag');

  if (!expected.expectUuid) {
    lines.push(`ALTER TABLE \`${baseName}\` CHANGE \`legacy_uuid\` \`uuid\` char(36) DEFAULT NULL;`);
  }
  expected.mustHave.add('uuid');
  expected.mustNotHave.add('legacy_uuid');

  if (expected.expectFk) {
    lines.push(`ALTER TABLE \`${baseName}\` ADD CONSTRAINT \`${baseName}_owner_id_foreign\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL;`);
  }

  if (expected.expectTimestamps) {
    lines.push(`ALTER TABLE \`${baseName}\` ADD COLUMN \`created_at\` timestamp NULL DEFAULT NULL, ADD COLUMN \`updated_at\` timestamp NULL DEFAULT NULL;`);
    expected.mustHave.add('created_at');
    expected.mustHave.add('updated_at');
  }

  if (finalName !== baseName) {
    lines.push(`ALTER TABLE \`${baseName}\` RENAME TO \`${finalName}\`;`);
  }

  lines.push('COMMIT;');

  return {
    sql: lines.join('\n'),
    validate(parsed) {
      const table = parsed.tables[finalName];
      assert(table, `${finalName}: missing parsed table`);
      assert(!parsed.tables[baseName] || baseName === finalName, `${baseName}: stale renamed table remains`);
      for (const name of expected.mustHave) assert(table.columns[name], `${finalName}: missing column ${name}`);
      for (const name of expected.mustNotHave) assert(!table.columns[name], `${finalName}: removed column still present ${name}`);
      assert(table.columns.id?.autoIncrement, `${finalName}: id not auto increment`);
      assert(table.indexes.some(idx => /PRIMARY\s+KEY/i.test(idx)), `${finalName}: missing primary key`);
      assert(table.indexes.some(idx => idx.includes(`${baseName}_code_unique`)), `${finalName}: missing unique code index`);
      if (expected.expectFk) {
        assert(table.foreignKeys.some(fk => fk.includes(`${baseName}_owner_id_foreign`)), `${finalName}: missing owner fk`);
      }
      const code = expectMigration(finalName, table, { dbDriver: 'mysql', dbVersion: '8.4' });
      assert(code.includes("$table->id();"), `${finalName}: expected id helper`);
      assert(code.includes("$table->string('code', 90)->unique();"), `${finalName}: expected unique code helper`);
      assert(code.includes("$table->uuid('uuid')"), `${finalName}: expected uuid helper`);
      if (expected.expectFk) {
        assert(code.includes("$table->foreignId('owner_id')"), `${finalName}: expected owner foreignId helper`);
        assert(code.includes('->constrained(') || code.includes('->constrained()'), `${finalName}: expected owner constrained helper`);
        assert(code.includes('->nullOnDelete();'), `${finalName}: expected owner nullOnDelete helper`);
      }
      if (expected.expectTimestamps) {
        assert(code.includes('$table->timestamps();'), `${finalName}: expected timestamps helper`);
      }
    }
  };
}

function buildPostgresCase(seed) {
  const rand = mulberry32(seed * 31);
  const parentName = `pg_parent_${seed}`;
  const baseName = `pg_child_${seed}`;
  const finalName = maybe(rand, 0.45) ? `${baseName}_final` : baseName;
  const dropUnique = maybe(rand, 0.25);

  const expected = {
    parentName,
    finalName,
    expectUniqueCode: !dropUnique,
    expectDeletedAt: maybe(rand, 0.5)
  };

  const lines = [
    `CREATE TABLE public.${parentName} (`,
    '  id bigserial NOT NULL,',
    '  uuid uuid NOT NULL,',
    '  created_at timestamp with time zone NULL,',
    '  updated_at timestamp with time zone NULL',
    ');',
    `ALTER TABLE ONLY public.${parentName} ADD CONSTRAINT ${parentName}_pkey PRIMARY KEY (id);`,
    `ALTER TABLE ONLY public.${parentName} ADD CONSTRAINT ${parentName}_uuid_unique UNIQUE (uuid);`,
    `CREATE TABLE public.${baseName} (`,
    '  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,',
    `  ${parentName}_id bigint NOT NULL,`,
    '  code character varying(110) NOT NULL,',
    '  payload jsonb,',
    '  search_vector tsvector,',
    '  embedding vector(768),',
    '  region geography,',
    '  client_ip inet,',
    '  device_mac macaddr,',
    '  old_label character varying(120),',
    '  created_at timestamp with time zone NULL,',
    '  updated_at timestamp with time zone NULL',
    ');',
    `ALTER TABLE ONLY public.${baseName} ADD CONSTRAINT ${baseName}_pkey PRIMARY KEY (id);`,
    `ALTER TABLE ONLY public.${baseName} ADD CONSTRAINT ${baseName}_${parentName}_id_foreign FOREIGN KEY (${parentName}_id) REFERENCES public.${parentName}(id) ON DELETE CASCADE;`,
    `ALTER TABLE ONLY public.${baseName} ADD CONSTRAINT ${baseName}_code_unique UNIQUE (code);`,
    `ALTER TABLE ONLY public.${baseName} RENAME COLUMN old_label TO label;`
  ];

  if (expected.expectDeletedAt) {
    lines.push(`ALTER TABLE ONLY public.${baseName} ADD COLUMN deleted_at timestamp with time zone NULL;`);
  }

  if (dropUnique) {
    lines.push(`ALTER TABLE ONLY public.${baseName} DROP CONSTRAINT ${baseName}_code_unique;`);
  }

  if (finalName !== baseName) {
    lines.push(`ALTER TABLE ONLY public.${baseName} RENAME TO ${finalName};`);
  }

  lines.push('COMMIT;');

  return {
    sql: lines.join('\n'),
    validate(parsed) {
      const parent = parsed.tables[parentName];
      const child = parsed.tables[finalName];
      assert(parent, `${parentName}: missing parsed parent`);
      assert(child, `${finalName}: missing parsed child`);
      assert(!parsed.tables[baseName] || baseName === finalName, `${baseName}: stale renamed child remains`);
      assert(parent.columns.id?.autoIncrement, `${parentName}: parent id should auto increment`);
      assert(child.columns.label, `${finalName}: missing renamed label column`);
      assert(!child.columns.old_label, `${finalName}: old_label should be gone`);
      assert(child.foreignKeys.some(fk => fk.includes(`${baseName}_${parentName}_id_foreign`)), `${finalName}: missing parent fk`);
      if (expected.expectDeletedAt) {
        assert(child.columns.deleted_at, `${finalName}: missing deleted_at`);
      }
      if (expected.expectUniqueCode) {
        assert(child.indexes.some(idx => idx.includes(`${baseName}_code_unique`)), `${finalName}: unique code constraint missing`);
      } else {
        assert(!child.indexes.some(idx => idx.includes(`${baseName}_code_unique`)), `${finalName}: dropped unique still present`);
      }

      const parentCode = expectMigration(parentName, parent, { dbDriver: 'pgsql', dbVersion: '15.0' });
      assert(parentCode.includes("$table->id();"), `${parentName}: expected id helper`);
      assert(parentCode.includes("$table->uuid('uuid')->unique();"), `${parentName}: expected unique uuid helper`);
      assert(parentCode.includes('$table->timestampsTz();'), `${parentName}: expected tz timestamps`);

      const childCode = expectMigration(finalName, child, { dbDriver: 'pgsql', dbVersion: '15.0' });
      assert(childCode.includes("$table->bigInteger('id')->primary()->generatedAs()->always();"), `${finalName}: expected identity primary`);
      assert(childCode.includes(`$table->foreignId('${parentName}_id')`), `${finalName}: expected foreignId helper`);
      assert(childCode.includes('->constrained(') || childCode.includes('->constrained()'), `${finalName}: expected constrained helper`);
      assert(childCode.includes('->cascadeOnDelete();'), `${finalName}: expected cascadeOnDelete helper`);
      assert(childCode.includes("$table->jsonb('payload')->nullable();"), `${finalName}: expected jsonb`);
      assert(childCode.includes("$table->tsvector('search_vector')->nullable();"), `${finalName}: expected tsvector`);
      assert(childCode.includes("$table->vector('embedding', 768)->nullable();"), `${finalName}: expected vector`);
      assert(childCode.includes("$table->geography('region')->nullable();"), `${finalName}: expected geography`);
      assert(childCode.includes("$table->ipAddress('client_ip')->nullable();"), `${finalName}: expected client_ip`);
      assert(childCode.includes("$table->macAddress('device_mac')->nullable();"), `${finalName}: expected device_mac`);
      if (expected.expectUniqueCode) {
        assert(childCode.includes("$table->string('code', 110)->unique();"), `${finalName}: expected unique code`);
      } else {
        assert(childCode.includes("$table->string('code', 110);"), `${finalName}: expected non-unique code`);
      }
      if (expected.expectDeletedAt) {
        assert(childCode.includes('$table->softDeletesTz();'), `${finalName}: expected soft deletes tz`);
      }
    }
  };
}

function runCase(seed) {
  const builder = seed % 2 === 0 ? buildMySqlCase : buildPostgresCase;
  const { sql, validate } = builder(seed);
  const parsed = SQLParser.parseSQLContent(sql);
  validate(parsed);
}

const RUNS = 300;
for (let seed = 1; seed <= RUNS; seed++) {
  runCase(seed);
}

console.log(`vendor mutation fuzz ok: ${RUNS} seeds`);
