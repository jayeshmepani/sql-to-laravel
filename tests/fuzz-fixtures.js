const assert = require('assert');
const SQLParser = require('../js/SQLParser');
const MigrationGenerator = require('../js/MigrationGenerator');

function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function pick(rand, items) {
  return items[Math.floor(rand() * items.length)];
}

function maybe(rand, chance = 0.5) {
  return rand() < chance;
}

function buildExpectedState() {
  return {
    columns: new Map(),
    droppedColumns: new Set(),
    indexes: new Set(),
    foreignKeys: new Set(),
    primary: false,
    autoIncrementId: false
  };
}

function addColumn(expected, name, type, opts = {}) {
  expected.columns.set(name, { type, ...opts });
  expected.droppedColumns.delete(name);
}

function generateCase(seed) {
  const rand = mulberry32(seed);
  const tableName = `fz_${seed}`;
  const expected = buildExpectedState();
  const lines = [`DROP TABLE IF EXISTS \`${tableName}\`;`];

  const baseColumns = [
    { name: 'id', sql: '`id` bigint unsigned NOT NULL', type: 'id' },
    { name: 'code', sql: '`code` varchar(64) NOT NULL', type: 'string' },
    { name: 'user_id', sql: '`user_id` bigint unsigned NULL', type: 'fk' },
    { name: 'uuid', sql: '`uuid` char(36) NULL', type: 'uuid' },
    { name: 'payload', sql: '`payload` longtext NULL', type: 'json_text' },
    { name: 'flag', sql: '`flag` tinyint(1) NOT NULL DEFAULT \'0\'', type: 'boolean' }
  ];

  const selected = baseColumns.filter(col => col.name === 'id' || maybe(rand, 0.75));
  lines.push(`CREATE TABLE \`${tableName}\` (\n  ${selected.map(col => col.sql).join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  for (const col of selected) {
    addColumn(expected, col.name, col.type);
  }

  const alterOps = [];
  alterOps.push('ADD PRIMARY KEY (`id`)');
  expected.primary = true;

  if (expected.columns.has('uuid')) {
    alterOps.push(`ADD UNIQUE KEY \`${tableName}_uuid_unique\` (\`uuid\`)`);
    expected.indexes.add(`${tableName}_uuid_unique`);
  }

  if (expected.columns.has('code') && maybe(rand, 0.8)) {
    alterOps.push(`ADD UNIQUE KEY \`${tableName}_code_unique\` (\`code\`)`);
    expected.indexes.add(`${tableName}_code_unique`);
  }

  if (expected.columns.has('user_id') && maybe(rand, 0.8)) {
    alterOps.push(`ADD KEY \`${tableName}_user_id_foreign\` (\`user_id\`)`);
    alterOps.push(`ADD CONSTRAINT \`${tableName}_user_id_foreign\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL`);
    expected.indexes.add(`${tableName}_user_id_foreign`);
    expected.foreignKeys.add(`${tableName}_user_id_foreign`);
  }

  lines.push(`ALTER TABLE \`${tableName}\`\n  ${alterOps.join(',\n  ')};`);
  lines.push(`ALTER TABLE \`${tableName}\`\n  MODIFY \`id\` bigint unsigned NOT NULL AUTO_INCREMENT;`);
  expected.autoIncrementId = true;

  const extraOps = [];

  if (expected.columns.has('payload')) {
    extraOps.push('CHANGE `payload` `meta` longtext NULL');
    expected.columns.delete('payload');
    addColumn(expected, 'meta', 'json_text');
  }

  if (maybe(rand, 0.7)) {
    extraOps.push('ADD COLUMN `created_at` timestamp NULL DEFAULT NULL');
    addColumn(expected, 'created_at', 'timestamp');
  }

  if (maybe(rand, 0.7)) {
    extraOps.push('ADD COLUMN `updated_at` timestamp NULL DEFAULT NULL');
    addColumn(expected, 'updated_at', 'timestamp');
  }

  if (maybe(rand, 0.4)) {
    extraOps.push('ADD COLUMN `deleted_at` timestamp NULL DEFAULT NULL');
    addColumn(expected, 'deleted_at', 'timestamp');
  }

  if (expected.columns.has('flag') && maybe(rand, 0.5)) {
    extraOps.push('DROP COLUMN `flag`');
    expected.columns.delete('flag');
    expected.droppedColumns.add('flag');
  }

  if (expected.indexes.has(`${tableName}_code_unique`) && maybe(rand, 0.35)) {
    lines.push(`DROP INDEX \`${tableName}_code_unique\` ON \`${tableName}\`;`);
    expected.indexes.delete(`${tableName}_code_unique`);
  }

  if (extraOps.length) {
    lines.push(`ALTER TABLE \`${tableName}\`\n  ${extraOps.join(',\n  ')};`);
  }

  lines.push('COMMIT;');

  return { sql: lines.join('\n\n'), tableName, expected };
}

function runCase(seed) {
  const { sql, tableName, expected } = generateCase(seed);
  const parsed = SQLParser.parseSQLContent(sql);
  const table = parsed.tables[tableName];
  assert(table, `seed ${seed}: missing table`);

  for (const [name] of expected.columns) {
    assert(table.columns[name], `seed ${seed}: missing column ${name}`);
  }

  for (const name of expected.droppedColumns) {
    assert(!table.columns[name], `seed ${seed}: dropped column still present ${name}`);
  }

  if (expected.primary) {
    assert(table.indexes.some(idx => /PRIMARY\s+KEY/i.test(idx)), `seed ${seed}: missing primary key`);
  }

  if (expected.autoIncrementId) {
    assert(table.columns.id?.autoIncrement, `seed ${seed}: id should be auto increment`);
  }

  for (const indexName of expected.indexes) {
    assert(table.indexes.some(idx => idx.includes(indexName)), `seed ${seed}: missing index ${indexName}`);
  }

  for (const fkName of expected.foreignKeys) {
    assert(table.foreignKeys.some(fk => fk.includes(fkName)), `seed ${seed}: missing fk ${fkName}`);
  }

  const migration = MigrationGenerator.generate(tableName, table, {
    laravelVersion: 13,
    dbDriver: 'mysql',
    dbVersion: '8.4'
  });
  assert(migration, `seed ${seed}: missing migration`);
  assert(!migration.includes('undefined'), `seed ${seed}: invalid migration`);
}

const RUNS = 250;
for (let seed = 1; seed <= RUNS; seed++) {
  runCase(seed);
}

console.log(`fuzz verification ok: ${RUNS} seeds`);
