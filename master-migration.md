Here are the two comprehensive, lossless master documents derived from merging all the provided knowledge. Every detail, warning, code snippet, and framework feature has been carefully synthesized into these two complete references.

---

# DOCUMENT 1: MIGRATIONS (Old vs. Modern Laravel 12+)

This reference covers the complete evolution of Laravel database migrations, contrasting legacy "verbose" syntax with the modern "convention-based, expressive, and model-aware" styles recommended in the Laravel 12+ documentation.

## 1. High-Level Mental Model
Think of the evolution of schema building in four phases. All forms still work in Laravel 12, but modern code strongly prefers the latter phases:
*   **A. Manual / Explicit (Old):** Explicitly declaring types and building constraints manually (e.g., `unsignedBigInteger` + `foreign()->references()->on()`).
*   **B. Convention-Based Shorthand (Modern):** Letting Laravel guess constraints from column names (e.g., `foreignId()->constrained()`).
*   **C. Expressive Action Helpers (Modern):** Readable, chained actions (e.g., `cascadeOnDelete()`, `nullOnDelete()`).
*   **D. Model-Aware Helpers (Laravel 12+):** Inferring everything straight from the Eloquent Model class (e.g., `foreignIdFor(User::class)`).

## 2. Migration File Structure
Older Laravel projects generated migrations as named classes. Starting in Laravel 9, migrations use **anonymous classes** to prevent class-name collisions and improve IDE support.

**⊘ Old (Laravel 5.x–8.x)**
```php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreatePostsTable extends Migration
{
    public function up()
    {
        Schema::create('posts', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->timestamps();
        });
    }
}
```

**✓ Modern (Laravel 9+ / 12.x)**
*Notice the anonymous class and strict return types (`: void`).*
```php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('posts', function (Blueprint $table) {
            $table->id(); // Shorthand for bigIncrements
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('posts');
    }
};
```

## 3. Primary Keys
Laravel progressively introduced shorthands for common primary keys.

| Old (Still Valid) | Modern Shorthand | Notes |
| :--- | :--- | :--- |
| `$table->increments('id')` | `$table->id()` | `id()` (L7+) creates UNSIGNED BIGINT. `increments()` was an UNSIGNED INT (4 bytes). |
| `$table->bigIncrements('id')` | `$table->id()` | Standard modern integer key. To rename: `$table->id('post_id')`. |
| `$table->uuid('id'); $table->primary('id');` | `$table->uuid('id')->primary()` | UUID primary key. |
| *Not available* | `$table->ulid('id')->primary()` | ULID primary key (Laravel 9+). Sortable strings. |

## 4. Foreign Keys: Full Overview
The biggest area of schema evolution. The classic form requires multiple steps; modern forms do it in one chain.

### A. Basic Foreign Key
**⊘ Old:**
```php
$table->unsignedBigInteger('user_id');
$table->foreign('user_id')->references('id')->on('users');
```
**✓ Modern:**
```php
// foreignId() creates an UNSIGNED BIGINT.
// constrained() infers 'users.id' from 'user_id'
$table->foreignId('user_id')->constrained();
```

### B. Delete Actions (Cascade, Null, Restrict, No Action)
**⊘ Old:**
```php
$table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
$table->foreign('user_id')->references('id')->on('users')->onDelete('set null');
$table->foreign('user_id')->references('id')->on('users')->onDelete('restrict');
$table->foreign('user_id')->references('id')->on('users')->onDelete('no action');
```
**✓ Modern Expressive Helpers:**
```php
$table->foreignId('user_id')->constrained()->cascadeOnDelete();
$table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
$table->foreignId('user_id')->constrained()->restrictOnDelete();
$table->foreignId('user_id')->constrained()->noActionOnDelete();
```

> **⚠️ CRITICAL LARAVEL RULE: The Ordering Rule**
> When using `foreignId()->constrained()`, **ALL column modifiers** (`nullable()`, `default()`, `after()`) must be called **BEFORE** `constrained()`. If placed after, they silently fail.
> **Correct:** `$table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();`
> **Wrong:** `$table->foreignId('user_id')->constrained()->nullable();`

### C. Update Actions
All delete helpers have update equivalents:
*   `->cascadeOnUpdate()`
*   `->nullOnUpdate()` *(column must be `nullable()`)*
*   `->restrictOnUpdate()`
*   `->noActionOnUpdate()`

### D. UUID / ULID Foreign Keys
If the parent model uses UUID/ULID primary keys, the foreign key column type must match.
**⊘ Old:**
```php
$table->uuid('user_id');
$table->foreign('user_id')->references('id')->on('users');
```
**✓ Modern:**
```php
$table->foreignUuid('user_id')->constrained(); // Creates CHAR(36)
$table->foreignUlid('user_id')->constrained(); // Creates CHAR(26)
```

### E. Model-Based Foreign Keys (`foreignIdFor`)
The most robust modern helper. It infers the column name (e.g., `user_id`) and the **correct data type** (integer, UUID, or ULID) dynamically based on the model's `$keyType` configuration.
```php
use App\Models\User;

// Automatically handles BigInt vs UUID vs ULID based on User model
$table->foreignIdFor(User::class)->constrained()->cascadeOnDelete();

// With custom column override
$table->foreignIdFor(User::class, 'author_id')->constrained('users');
```

### F. Custom Names / Breaking Convention
If your table or index doesn't follow conventions, modern Laravel allows PHP named parameters in `constrained()`:
```php
// Old
$table->unsignedBigInteger('author_id');
$table->foreign('author_id', 'custom_idx_name')->references('id')->on('users');

// Modern
$table->foreignId('author_id')->constrained(
    table: 'users',
    indexName: 'custom_idx_name'
);

// Modern (Override table + PK column)
$table->foreignId('author_id')->constrained('users', 'uuid');
```

### G. Dropping Foreign Keys
**⊘ Old / Manual Name:** `$table->dropForeign('posts_user_id_foreign');`
**✓ Modern Convention:** `$table->dropForeign(['user_id']);` *(Laravel calculates the convention name automatically)*.

**Disable constraints temporarily:**
```php
// Old way
Schema::disableForeignKeyConstraints();
Schema::enableForeignKeyConstraints();

// Modern scoped block (L10+)
Schema::withoutForeignKeyConstraints(function () {
    // truncates / drops here
});
```

## 5. Polymorphic Columns
**⊘ Old Manual:**
```php
$table->unsignedBigInteger('imageable_id');
$table->string('imageable_type');
$table->index(['imageable_id', 'imageable_type']);
```
**✓ Modern Shorthands:**
```php
$table->morphs('imageable');           // Creates BIGINT id + string type + index
$table->nullableMorphs('imageable');   // Creates nullable morphs
$table->uuidMorphs('imageable');       // L9+: UUID morph pair
$table->ulidMorphs('imageable');       // L9+: ULID morph pair
```

## 6. Column Modifiers
Chained methods that alter column creation. Must go *before* `constrained()`.
*   `->nullable()`: Allows NULL
*   `->default($val)`: Sets default value
*   `->after('col')` / `->first()`: MySQL position
*   `->comment('text')`: DB level comment
*   `->invisible()`: MySQL 8.0.23+ (L10+) hidden from `SELECT *`
*   `->instant()`: MySQL INSTANT algorithm (L12+), no table rebuild
*   `->lock('none')`: MySQL table lock level (L12+)
*   `->virtualAs('expr')` / `->storedAs('expr')`: Generated columns
*   `->generatedAs()` / `->always()`: PostgreSQL identity columns (L8+)

## 7. Column Types Reference
| Category | Old Method | Modern Equivalent / DB Type | Notes |
| :--- | :--- | :--- | :--- |
| **Numeric** | `->increments('id')` | `->id()` / UNSIGNED BIGINT | Auto incrementing |
| | `->float('price', 8, 2)` | `->float('price')` | Float precision dropped in L11 |
| | `->decimal('price', 8, 2)` | `->decimal('price', 8, 2)` | Precise decimals |
| **String/Text** | `->string('name')` | VARCHAR(255) | Default 255 |
| | `->text()` | TEXT | 65,535 chars max |
| | `->json()` / `->jsonb()` | JSON / JSONB | JSON column / PostgreSQL binary |
| | `->uuid()` | CHAR(36) | UUID string |
| | `->ulid()` | CHAR(26) | Sortable string (L9+) |
| **Date/Time** | `->nullableTimestamps()` | `->timestamps()` | Standard `created_at`/`updated_at`. Old is deprecated. |
| | `->timestampTz()` | TIMESTAMP with TZ | |
| | `->softDeletes()` | `deleted_at` TIMESTAMP | For Eloquent soft deletes |

## 8. Indexes
**⊘ Old:** Separately defined.
```php
$table->string('email');
$table->unique('email', 'users_email_idx');
$table->index(['first_name', 'last_name']);
```
**✓ Modern:** Chained fluently on columns.
```php
$table->string('email')->unique();
$table->string('last_name')->index();

// PostgreSQL / MySQL 8 Modern index features
$table->string('email')->unique()->online();     // L12+ avoid table lock
$table->index('email')->concurrently();          // PostgreSQL Concurrent
$table->fullText(['title', 'body']);             // Fulltext index
```

## 9. Modifying and Dropping Columns
A massive change in **Laravel 10** was dropping the `doctrine/dbal` dependency. Column modification is now native to the Schema Builder.

**⊘ Old:** Required `composer require doctrine/dbal`.
**✓ Modern (L10+):** Native to framework.
```php
// Modify column type or attributes
$table->string('name', 150)->change();
$table->renameColumn('from_col', 'to_col');
$table->dropColumn(['votes', 'avatar']);
$table->dropTimestamps();
$table->dropSoftDeletes();
$table->dropMorphs('taggable');
```
> **⚠️ CRITICAL LARAVEL 12 RULE for `change()`:**
> When modifying a column, **missing modifiers will be dropped**. You must include every modifier you want to retain:
> `$table->integer('votes')->unsigned()->default(1)->comment('vote count')->change();`

## 10. Table Operations
```php
Schema::hasTable('users');
Schema::hasColumn('users', 'email');
Schema::hasIndex('users', ['email'], 'unique'); // L11+

Schema::rename('from_table', 'to_table');
Schema::dropIfExists('users');
```
*Warning:* Renaming a table breaks convention-based FK constraints because the old constraint name embeds the old table name. Use explicitly named constraints if you plan to rename tables.

---
