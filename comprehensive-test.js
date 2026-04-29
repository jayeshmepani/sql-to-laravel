const assert = require('node:assert/strict');
const fs = require('fs');

const SQLParser = require('./SQLParser');
const MigrationGenerator = require('./MigrationGenerator');
const SeederGenerator = require('./SeederGenerator');

const sqlContent = fs.readFileSync('./test.sql', 'utf8');
const parsed = SQLParser.parseSQLContent(sqlContent);

const migration = (table, laravelVersion = 12) => {
    assert.ok(parsed.tables[table], `Expected table "${table}" to be parsed from test.sql`);
    const output = MigrationGenerator.generate(table, parsed.tables[table], { laravelVersion });
    assert.ok(output, `Expected migration for "${table}"`);
    return output;
};

console.log('Testing comprehensive SQL to Laravel migration conversion...\n');
console.log(`Parsed ${Object.keys(parsed.tables).length} tables from SQL\n`);

const numericMigration = migration('numeric_exhaustive');
assert.match(numericMigration, /\$table->id\(\);/);
assert.match(numericMigration, /\$table->unsignedTinyInteger\('c_tinyint_u'\);/);
assert.match(numericMigration, /\$table->decimal\('c_decimal', 15, 5\)->default\('123\.45678'\);/);
assert.match(numericMigration, /\$table->boolean\('c_bool_true'\)->default\(true\);/);

const modifierMigration = migration('modifier_exhaustive');
assert.doesNotMatch(modifierMigration, /->nullable\(\)->default\(null\)/);
assert.match(modifierMigration, /\$table->string\('c_unique', 255\)->unique\(\);/);
assert.match(modifierMigration, /\$table->string\('c_index', 255\)->index\(\);/);
assert.match(modifierMigration, /\$table->text\('c_fulltext'\)->fullText\(\);/);
assert.match(modifierMigration, /\$table->timestamp\('c_default_current'\)->useCurrent\(\);/);

const spatialMigration = migration('spatial_exhaustive');
assert.match(spatialMigration, /\$table->point\('c_point'\)->spatialIndex\(\);/);
assert.match(spatialMigration, /\$table->polygon\('c_polygon'\)->spatialIndex\(\);/);
assert.doesNotMatch(spatialMigration, /\$table->(?:point|polygon)\('[^']+'\)->index\(\);/);

const relationshipMigration = migration('relationship_exhaustive');
assert.match(relationshipMigration, /\$table->foreignId\('category_id'\)->constrained\('numeric_exhaustive'\)->cascadeOnDelete\(\)->cascadeOnUpdate\(\);/);
assert.match(relationshipMigration, /\$table->foreignUuid\('owner_uuid'\)->constrained\('string_exhaustive'\)->restrictOnDelete\(\)->noActionOnUpdate\(\);/);
assert.match(relationshipMigration, /\$table->morphs\('commentable'\);/);
assert.match(relationshipMigration, /\$table->nullableMorphs\('imageable'\);/);

const compositeMigration = migration('composite_keys_exhaustive');
assert.match(compositeMigration, /\$table->primary\(\['pk_int_1', 'pk_int_2'\]\);/);
assert.match(compositeMigration, /\$table->unique\(\['fk_int_1', 'fk_int_2'\], 'composite_unique'\);/);
assert.match(compositeMigration, /\$table->foreign\(\['fk_int_1', 'fk_int_2'\], 'fk_composite_ref'\)->references\(\['pk_int_1', 'pk_int_2'\]\)->on\('composite_keys_exhaustive'\)->cascadeOnDelete\(\);/);

const laravel11Migration = migration('laravel_13_features', 11);
const laravel12Migration = migration('laravel_13_features', 12);
const laravel13Migration = migration('laravel_13_features', 13);
assert.match(laravel11Migration, /\$table->text\('c_tsvector'\)->nullable\(\);/);
assert.doesNotMatch(laravel11Migration, /\$table->tsvector\('c_tsvector'\)/);
assert.match(laravel12Migration, /\$table->tsvector\('c_tsvector'\)->nullable\(\);/);
assert.match(laravel13Migration, /\$table->tsvector\('c_tsvector'\)->nullable\(\);/);
assert.match(laravel12Migration, /use Illuminate\\Database\\Migrations\\Migration;/);
assert.match(laravel12Migration, /use Illuminate\\Database\\Schema\\Blueprint;/);
assert.match(laravel12Migration, /use Illuminate\\Support\\Facades\\Schema;/);

const extremeMigration = migration('extreme_exhaustive');
assert.match(extremeMigration, /\$table->vector\('c_vector', 1536\);/);
assert.match(extremeMigration, /\$table->geometryCollection\('c_geocollection'\);/);
assert.match(extremeMigration, /\$table->multiPoint\('c_multipoint'\);/);
assert.match(extremeMigration, /\$table->multiLineString\('c_multiline'\);/);
assert.match(extremeMigration, /\$table->multiPolygon\('c_multipolygon'\);/);

const seeders = SeederGenerator.generateAllSeeders(sqlContent);
assert.ok(seeders.seeders);
assert.deepEqual(Object.keys(seeders.seeders), []);
assert.equal(seeders.databaseSeeder, null);

console.log('All comprehensive migration and seeder checks passed.');
console.log(`Generated ${Object.keys(parsed.tables).length} migrations and ${Object.keys(seeders.seeders).length} individual seeders.`);
