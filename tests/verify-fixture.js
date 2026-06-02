const fs = require('fs');
const path = require('path');
const assert = require('assert');
const SQLParser = require('../js/SQLParser');
const MigrationGenerator = require('../js/MigrationGenerator');

const sql = fs.readFileSync(path.join(__dirname, 'test.sql'), 'utf8');
const parsed = SQLParser.parseSQLContent(sql);

function migration(tableName, options = {}) {
  const table = parsed.tables[tableName];
  assert(table, `missing parsed table: ${tableName}`);
  const code = MigrationGenerator.generate(tableName, table, {
    laravelVersion: 13,
    dbDriver: 'mysql',
    dbVersion: '8.4',
    ...options
  });
  assert(code, `missing migration output: ${tableName}`);
  return code;
}

function expectIncludes(code, needles, label) {
  for (const needle of needles) {
    assert(
      code.includes(needle),
      `${label} missing expected fragment:\n${needle}\n\nGenerated:\n${code}`
    );
  }
}

function expectNotIncludes(code, needles, label) {
  for (const needle of needles) {
    assert(
      !code.includes(needle),
      `${label} unexpectedly included fragment:\n${needle}\n\nGenerated:\n${code}`
    );
  }
}

assert(!parsed.tables.deleted_shadow_table, 'dropped table should not exist');
assert(!parsed.tables.temp_feature_flags, 'dropped temp table should not exist');
assert(!parsed.tables.legacy_members, 'renamed table should not remain under old name');
assert(parsed.tables.members, 'renamed table should exist under final name');
assert(!parsed.tables.rename_chain_seed, 'rename seed table should not remain');
assert(!parsed.tables.rename_chain_mid, 'rename mid table should not remain');
assert(parsed.tables.rename_chain_final, 'rename final table should exist');

const users = migration('users');
expectIncludes(users, [
  "$table->id();",
  "$table->uuid('uuid')->unique();",
  "$table->string('email', 191)->unique();",
  "$table->rememberToken();",
  "$table->timestamps();",
  "$table->softDeletes();"
], 'users');

const roleUser = migration('role_user');
expectIncludes(roleUser, [
  "$table->id();",
  "$table->foreignId('role_id')->constrained()->cascadeOnDelete();",
  "$table->foreignId('user_id')->constrained()->cascadeOnDelete();",
  "$table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();",
  "$table->unique(['role_id', 'user_id'], 'role_user_role_id_user_id_unique');"
], 'role_user');

const permissionRole = migration('permission_role');
expectIncludes(permissionRole, [
  "$table->primary(['permission_id', 'role_id']);"
], 'permission_role');

const profilesMySql = migration('profiles');
expectIncludes(profilesMySql, [
  "$table->id();",
  "$table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();",
  "$table->json('preferences')->nullable();",
  "->storedAs("
], 'profiles mysql');

const profilesPg = migration('profiles', { dbDriver: 'pgsql', dbVersion: '15.0' });
expectIncludes(profilesPg, [
  "$table->jsonb('preferences')->nullable();"
], 'profiles pg');

const postsPg = migration('posts', { dbDriver: 'pgsql', dbVersion: '15.0' });
expectIncludes(postsPg, [
  "$table->tsvector('search_body')->nullable();",
  "$table->timestamps();",
  "$table->softDeletes();"
], 'posts pg');

const comments = migration('comments');
expectIncludes(comments, [
  "$table->morphs('commentable');"
], 'comments');

const media = migration('media');
expectIncludes(media, [
  "$table->nullableMorphs('mediable');"
], 'media');

const activityFeeds = migration('activity_feeds');
expectIncludes(activityFeeds, [
  "$table->uuidMorphs('parentable');"
], 'activity_feeds');

const reactions = migration('reactions');
expectIncludes(reactions, [
  "$table->nullableUlidMorphs('reactable');"
], 'reactions');

const stations = migration('stations');
expectIncludes(stations, [
  "$table->id();",
  "$table->uuid('uuid')->unique();",
  "$table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();",
  "$table->geometry('coordinates')->spatialIndex();"
], 'stations');

const connectors = migration('connectors');
expectIncludes(connectors, [
  "$table->foreignId('station_id')->constrained()->cascadeOnDelete();",
  "$table->json('raw_payload')->nullable();"
], 'connectors');

const chargingSessions = migration('charging_sessions');
expectIncludes(chargingSessions, [
  "$table->foreignId('connector_id')->constrained()->cascadeOnDelete();",
  "$table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();",
  "->useCurrentOnUpdate()"
], 'charging_sessions');

const analyticsPg = migration('analytics_snapshots', { dbDriver: 'pgsql', dbVersion: '15.0' });
expectIncludes(analyticsPg, [
  "$table->foreignId('station_id')->constrained()->cascadeOnDelete();",
  "$table->jsonb('payload');",
  "$table->tsvector('search_vector')->nullable();",
  "$table->vector('embedding', 1536)->nullable();",
  "$table->vectorSparse('embedding_sparse', 30000)->nullable()",
  "$table->geography('region')->nullable();",
  "$table->ipAddress('client_ip')->nullable();",
  "$table->macAddress('device_mac')->nullable();",
  "$table->timestampsTz();",
  "$table->softDeletesTz();"
], 'analytics pg');

const hardwareModules = migration('hardware_modules');
expectIncludes(hardwareModules, [
  "$table->id();",
  "$table->foreignId('station_id')->constrained()->cascadeOnDelete();",
  "$table->char('module_uid', 26)->unique();",
  "$table->binary('firmware_hash', 16);",
  "->invisible()",
  "->virtualAs(",
  "->storedAs("
], 'hardware_modules');

const jobBatches = migration('job_batches');
expectIncludes(jobBatches, [
  "$table->string('id')->primary();"
], 'job_batches');

const cache = migration('cache');
expectIncludes(cache, [
  "$table->string('key')->primary();"
], 'cache');

const members = migration('members');
expectIncludes(members, [
  "$table->id();",
  "$table->uuid('uuid')->unique();",
  "$table->string('email')->unique();",
  "$table->foreignId('referrer_id')->nullable()->constrained('users')->nullOnDelete();"
], 'members');
expectNotIncludes(members, [
  'obsolete_token',
  'members_referrer_id_index'
], 'members');

const pgAuditSources = migration('pg_audit_sources', { dbDriver: 'pgsql', dbVersion: '15.0' });
expectIncludes(pgAuditSources, [
  "$table->id();",
  "$table->uuid('uuid')->unique();",
  "$table->string('source_key', 80)->unique();",
  "$table->jsonb('settings')->nullable();",
  "$table->timestampsTz();",
  "$table->softDeletesTz();"
], 'pg_audit_sources');

const pgAuditEvents = migration('pg_audit_events', { dbDriver: 'pgsql', dbVersion: '15.0' });
expectIncludes(pgAuditEvents, [
  "$table->bigInteger('id')->primary()->generatedAs()->always();",
  "$table->foreignId('source_id')->constrained('pg_audit_sources')->cascadeOnDelete();",
  "$table->string('event_code', 100)->unique();",
  "$table->jsonb('payload')->nullable();",
  "$table->tsvector('search_vector')->nullable();",
  "$table->vector('embedding', 1024)->nullable();",
  "$table->geography('region')->nullable();",
  "$table->ipAddress('client_ip')->nullable();",
  "$table->macAddress('device_mac')->nullable();",
  "$table->timestampsTz();"
], 'pg_audit_events');

const renameChainFinal = migration('rename_chain_final');
expectIncludes(renameChainFinal, [
  "$table->id();",
  "$table->string('slug', 120)->unique();",
  "$table->string('label', 180)->nullable();",
  "$table->uuid('uuid')->unique();",
  "$table->timestamps();"
], 'rename_chain_final');
expectNotIncludes(renameChainFinal, [
  'old_label',
  'temp_flag'
], 'rename_chain_final');

const dropMutationCases = migration('drop_mutation_cases');
expectIncludes(dropMutationCases, [
  "$table->id();",
  "$table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();",
  "$table->string('external_code', 80)->unique();",
  "$table->text('notes')->nullable();"
], 'drop_mutation_cases');
expectNotIncludes(dropMutationCases, [
  'legacy_code',
  'active_flag',
  'drop_mutation_cases_owner_id_index'
], 'drop_mutation_cases');

const missingAlpha = migration('missing_semicolon_alpha');
expectIncludes(missingAlpha, [
  "$table->id();"
], 'missing_semicolon_alpha');

const missingBeta = migration('missing_semicolon_beta');
expectIncludes(missingBeta, [
  "$table->id();",
  "$table->string('code', 50)->unique();"
], 'missing_semicolon_beta');

console.log(`fixture verification ok: ${Object.keys(parsed.tables).length} tables parsed`);
