const fs = require('fs');
const path = require('path');
const assert = require('assert');
const SQLParser = require('../js/SQLParser');
const MigrationGenerator = require('../js/MigrationGenerator');

function loadFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function parseFixture(name) {
  return SQLParser.parseSQLContent(loadFixture(name));
}

function migration(parsed, tableName, options = {}) {
  const code = MigrationGenerator.generate(tableName, parsed.tables[tableName], {
    laravelVersion: 13,
    dbDriver: 'mysql',
    dbVersion: '8.4',
    ...options
  });
  assert(code, `failed generating ${tableName}`);
  return code;
}

function expect(code, parts, label) {
  for (const part of parts) {
    assert(code.includes(part), `${label} missing:\n${part}\n\n${code}`);
  }
}

// mysql/phpmyadmin
{
  const parsed = parseFixture('mysql-phpmyadmin.sql');
  const users = migration(parsed, 'pm_users', { dbDriver: 'mysql', dbVersion: '8.0' });
  expect(users, [
    "$table->id();",
    "$table->uuid('uuid')->unique();",
    "$table->string('email')->unique();",
    "$table->rememberToken();",
    "$table->timestamps();"
  ], 'pm_users');

  const orders = migration(parsed, 'pm_orders', { dbDriver: 'mysql', dbVersion: '8.0' });
  expect(orders, [
    "$table->id();",
    "$table->foreignId('user_id')->nullable()->constrained('pm_users')->nullOnDelete();",
    "$table->json('meta')->nullable();"
  ], 'pm_orders');
}

// mariadb
{
  const parsed = parseFixture('mariadb-advanced.sql');
  const devices = migration(parsed, 'mdb_devices', { dbDriver: 'mariadb', dbVersion: '11.7' });
  expect(devices, [
    "$table->id();",
    "$table->string('device_code', 64)->unique();",
    "$table->json('payload')->nullable();",
    "$table->vector('embedding', 768)->nullable();",
    "$table->binary('firmware_hash', 16);",
    "->invisible()",
    "->storedAs("
  ], 'mdb_devices');
}

// postgresql
{
  const parsed = parseFixture('postgresql-mixed.sql');
  const accounts = migration(parsed, 'pg_accounts', { dbDriver: 'pgsql', dbVersion: '15.0' });
  expect(accounts, [
    "$table->id();",
    "$table->uuid('uuid')->unique();",
    "$table->jsonb('settings')->nullable();",
    "$table->timestampsTz();",
    "$table->softDeletesTz();"
  ], 'pg_accounts');

  const events = migration(parsed, 'pg_events', { dbDriver: 'pgsql', dbVersion: '15.0' });
  expect(events, [
    "$table->bigInteger('id')->primary()->generatedAs()->always();",
    "$table->foreignId('account_id')->constrained('pg_accounts')->cascadeOnDelete();",
    "$table->tsvector('search_vector')->nullable();",
    "$table->ipAddress('client_ip')->nullable();",
    "$table->macAddress('device_mac')->nullable();",
    "$table->geography('region')->nullable();",
    "$table->vector('embedding', 1536)->nullable();",
    "$table->timestampsTz();"
  ], 'pg_events');
}

// sqlite-style mutation handling
{
  const parsed = parseFixture('sqlite-mutations.sql');
  assert(parsed.tables.sq_projects, 'sq_projects missing');
  const projects = migration(parsed, 'sq_projects', { dbDriver: 'sqlite', dbVersion: '3.45' });
  expect(projects, [
    "$table->integer('id')->primary();",
    "$table->string('name');",
    "$table->string('slug', 120)->nullable();",
    "$table->json('metadata')->nullable();"
  ], 'sq_projects');
  assert(!projects.includes('owner_id'), 'sq_projects should have dropped owner_id');
}

// top-level create index statements
{
  const parsed = parseFixture('create-index-mixed.sql');

  const accounts = migration(parsed, 'cix_accounts', { dbDriver: 'pgsql', dbVersion: '15.0' });
  expect(accounts, [
    "$table->id();",
    "$table->string('email', 190)->unique();",
    "$table->timestampsTz();"
  ], 'cix_accounts');

  const notes = migration(parsed, 'sq_notes', { dbDriver: 'sqlite', dbVersion: '3.45' });
  expect(notes, [
    "$table->integer('id')->primary();",
    "$table->string('slug', 80)->unique();",
    "$table->json('metadata')->nullable();",
    "$table->timestamps();"
  ], 'sq_notes');
  assert(!notes.includes("->index()"), 'sq_notes account_id index should have been dropped');

  const dropProbe = migration(parsed, 'cix_drop_probe', { dbDriver: 'pgsql', dbVersion: '15.0' });
  expect(dropProbe, [
    "$table->id();",
    "$table->string('slug', 70);"
  ], 'cix_drop_probe');
  assert(!dropProbe.includes("->unique()"), 'cix_drop_probe unique index should have been dropped');
}

// partial / expression indexes preserved as raw statements
{
  const parsed = parseFixture('create-index-advanced.sql');
  const searches = MigrationGenerator.generate('cix_searches', parsed.tables.cix_searches, {
    laravelVersion: 13,
    dbDriver: 'pgsql',
    dbVersion: '15.0',
    includeRawStatements: false
  });
  expect(searches, [
    "$table->id();",
    "$table->string('email', 190);",
    "$table->timestampsTz();",
    "$table->softDeletesTz();"
  ], 'cix_searches');
  assert(!searches.includes('DB::statement'), 'cix_searches main migration should not include raw SQL');

  const searchesAux = MigrationGenerator.generateAuxiliaryMigration(parsed, { dbDriver: 'pgsql', dbVersion: '15.0' });
  expect(searchesAux, [
    "DB::statement('CREATE UNIQUE INDEX cix_searches_email_live_unique"
  ], 'cix_searches auxiliary');
  assert(!searchesAux.includes('cix_searches_tsv_idx'), 'cix_searches dropped expression index should not survive');
}

// create table as / view / trigger preservation
{
  const parsed = parseFixture('create-as-view-trigger.sql');
  assert(parsed.tables.cat_export, 'cat_export missing');
  assert(parsed.tables.cat_export.rawStatements?.some(stmt => stmt.includes('CREATE TABLE public.cat_export AS')), 'cat_export raw create-as missing');
  assert(parsed.globalStatements?.some(stmt => stmt.startsWith('CREATE VIEW public.cat_export_view')), 'create view should be preserved globally');
  assert(parsed.globalStatements?.some(stmt => stmt.startsWith('CREATE TRIGGER cat_export_touch')), 'create trigger should be preserved globally');

  const exportMigration = MigrationGenerator.generate('cat_export', parsed.tables.cat_export, {
    laravelVersion: 13,
    dbDriver: 'pgsql',
    dbVersion: '15.0',
    includeRawStatements: false
  });
  assert(!exportMigration, 'cat_export main migration should be omitted when raw statements are delegated to auxiliary');

  const auxiliary = MigrationGenerator.generateAuxiliaryMigration(parsed, { dbDriver: 'pgsql', dbVersion: '15.0' });
  expect(auxiliary, [
    "DB::statement('CREATE TABLE public.cat_export AS",
    "DB::statement('CREATE VIEW public.cat_export_view AS",
    "DB::statement('CREATE TRIGGER cat_export_touch"
  ], 'cat_export auxiliary');
}

console.log('vendor fixture verification ok');
