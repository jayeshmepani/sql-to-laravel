const test = require('node:test');
const assert = require('node:assert/strict');

const SQLParser = require('./SQLParser');
const MigrationGenerator = require('./MigrationGenerator');
const SeederGenerator = require('./SeederGenerator');

test('generates Laravel migration preserving common MySQL column details', () => {
    const sql = `CREATE TABLE \`users\` (
        \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
        \`email\` varchar(191) NOT NULL,
        \`amount\` decimal(10,2) NOT NULL DEFAULT 0.00,
        \`status\` enum('active','blocked') NOT NULL DEFAULT 'active',
        \`payload\` json DEFAULT NULL,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`users_email_unique\` (\`email\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

    const parsed = SQLParser.parseSQLContent(sql);
    const migration = MigrationGenerator.generate('users', parsed.tables.users);

    assert.match(migration, /return new class extends Migration/);
    assert.doesNotMatch(migration, /namespace Database\\Migrations/);
    assert.match(migration, /\$table->id\(\);/);
    assert.doesNotMatch(migration, /\$table->primary\('id'\);/);
    assert.match(migration, /\$table->string\('email', 191\)->unique\(\);/);
    assert.match(migration, /\$table->decimal\('amount', 10, 2\)->default\(0\);/);
    assert.match(migration, /\$table->enum\('status', \['active', 'blocked'\]\)->default\('active'\);/);
    assert.match(migration, /\$table->json\('payload'\)->nullable\(\);/);
    assert.match(migration, /\$table->timestamps\(\);/);
});

test('generates Laravel foreign key actions with multi-word SQL actions', () => {
    const sql = `CREATE TABLE \`posts\` (
        \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
        \`user_id\` bigint unsigned DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`posts_user_id_foreign\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
    );`;

    const parsed = SQLParser.parseSQLContent(sql);
    const migration = MigrationGenerator.generate('posts', parsed.tables.posts);

    assert.match(migration, /\$table->foreignId\('user_id'\)->nullable\(\)->constrained\(\)->nullOnDelete\(\)->cascadeOnUpdate\(\);/);
});

test('keeps insert column order per statement when generating seeders', () => {
    const sql = `INSERT INTO users (id, name) VALUES (1, 'Ada');
        INSERT INTO users (name, id) VALUES ('Grace', 2);`;

    const parsed = SQLParser.parseSQLContent(sql);
    const seeder = SeederGenerator.generate('users', parsed.tables.users);

    assert.match(seeder, /'id' => 1,\n\s+'name' => 'Ada'/);
    assert.match(seeder, /'name' => 'Grace',\n\s+'id' => 2/);
});

test('formats SQL values safely for Laravel seeders', () => {
    const sql = `INSERT INTO flags (id, active, created_at, payload, note) VALUES
        (1, b'1', CURRENT_TIMESTAMP, '{"ok":true}', 'O\\'Reilly');`;

    const parsed = SQLParser.parseSQLContent(sql);
    const seeder = SeederGenerator.generate('flags', parsed.tables.flags);

    assert.match(seeder, /'active' => 1/);
    assert.match(seeder, /'created_at' => now\(\)/);
    assert.match(seeder, /'payload' => '\{"ok":true\}'/);
    assert.match(seeder, /'note' => 'O\\'Reilly'/);
});

test('generates seeders with valid classes and foreign key constraint guards', () => {
    const sql = `INSERT INTO \`audit-log\` (id, message) VALUES (1, 'created');`;

    const parsed = SQLParser.parseSQLContent(sql);
    const seeder = SeederGenerator.generate('audit-log', parsed.tables['audit-log']);

    assert.match(seeder, /use Illuminate\\Support\\Facades\\Schema;/);
    assert.match(seeder, /class AuditLogSeeder extends Seeder/);
    assert.match(seeder, /Schema::withoutForeignKeyConstraints/);
});

test('uses create table column order for inserts without explicit columns', () => {
    const sql = `CREATE TABLE users (
        id int NOT NULL,
        name varchar(100) NOT NULL
    );
    INSERT INTO users VALUES (1, 'Ada');`;

    const parsed = SQLParser.parseSQLContent(sql);
    const seeder = SeederGenerator.generate('users', parsed.tables.users);

    assert.match(seeder, /'id' => 1,\n\s+'name' => 'Ada'/);
});

test('gates Laravel 12+ migration column helpers by selected version', () => {
    const sql = `CREATE TABLE laravel_13_features (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        c_geography geography NOT NULL,
        c_tsvector tsvector DEFAULT NULL,
        created_at timestamp with time zone NULL DEFAULT NULL,
        updated_at timestamp with time zone NULL DEFAULT NULL,
        deleted_at timestamp with time zone NULL DEFAULT NULL,
        PRIMARY KEY (id)
    );`;

    const parsed = SQLParser.parseSQLContent(sql);
    const laravel11 = MigrationGenerator.generate('laravel_13_features', parsed.tables.laravel_13_features, { laravelVersion: 11 });
    const laravel12 = MigrationGenerator.generate('laravel_13_features', parsed.tables.laravel_13_features, { laravelVersion: 12 });
    const laravel13 = MigrationGenerator.generate('laravel_13_features', parsed.tables.laravel_13_features, { laravelVersion: 13 });

    assert.doesNotMatch(laravel11, /\$table->tsvector\('c_tsvector'\)/);
    assert.match(laravel11, /\$table->text\('c_tsvector'\)->nullable\(\);/);
    assert.match(laravel12, /\$table->tsvector\('c_tsvector'\)->nullable\(\);/);
    assert.match(laravel13, /\$table->tsvector\('c_tsvector'\)->nullable\(\);/);
});

test('generates required migration imports without missing helper classes', () => {
    const sql = `CREATE TABLE posts (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        body tsvector DEFAULT NULL,
        PRIMARY KEY (id)
    );`;

    const parsed = SQLParser.parseSQLContent(sql);
    const migration = MigrationGenerator.generate('posts', parsed.tables.posts, { laravelVersion: 12 });

    assert.match(migration, /use Illuminate\\Database\\Migrations\\Migration;/);
    assert.match(migration, /use Illuminate\\Database\\Schema\\Blueprint;/);
    assert.match(migration, /use Illuminate\\Support\\Facades\\Schema;/);
    assert.doesNotMatch(migration, /DB::|Expression|new Expression/);
});

test('generates spatial indexes with the spatialIndex helper', () => {
    const sql = `CREATE TABLE places (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        area polygon NOT NULL,
        PRIMARY KEY (id),
        SPATIAL KEY places_area_spatial (area)
    );`;

    const parsed = SQLParser.parseSQLContent(sql);
    const migration = MigrationGenerator.generate('places', parsed.tables.places, { laravelVersion: 12 });

    assert.match(migration, /\$table->polygon\('area'\)->spatialIndex\(\);/);
    assert.doesNotMatch(migration, /\$table->polygon\('area'\)->index\(\);/);
});
