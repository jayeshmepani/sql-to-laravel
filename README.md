# 💎 SQL to Laravel Migration & Seeder Converter

A premium, privacy-first, client-side tool designed to transform raw SQL database dumps into high-quality, idiomatic Laravel migrations and seeders. Optimized for the modern Laravel era (11, 12, and 13).

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Laravel](https://img.shields.io/badge/laravel-11%20|%2012%20|%2013-red.svg)
![Environment](https://img.shields.io/badge/env-aware-success.svg)

## 🚀 Key Features

- **Environment-Aware Generation**: Intelligently optimizes code based on your target database (MySQL, PostgreSQL, MariaDB, SQLite) and specific version.
- **Modern Laravel Standards**: Full support for Laravel 11, 12, and 13 "Expressive" migration syntax.
- **Privacy First**: 100% client-side processing. Your SQL data never leaves your browser.
- **High-Fidelity Mapping**:
    - **JSON Promotion**: Automatically converts `LONGTEXT` with `json_valid` checks to native `JSON` types.
    - **AI/ML Ready**: Supports `vector()` (L11), `tsvector()` (L12), and `vectorSparse()` (L13).
    - **Spatial Precision**: Unified handling of Geometry, Geography, and 7+ spatial subtypes.
    - **Smart Morphs**: Detects polymorphic relationships and generates `$table->morphs()` helpers.
- **Intelligent Sorting**: Built-in Topological Sort analyzes Foreign Key dependencies to ensure migrations run in the correct chronological order.
- **Binary Collation Support**: Detects and preserves `utf8mb4_bin` for case-sensitive data integrity.

## 🛠️ Technical Stack

- **Vanilla JavaScript**: High-performance core without heavy framework overhead.
- **Web Workers**: Background processing for massive SQL files without freezing the UI.
- **JSZip Integration**: Batch export your entire database structure as a ready-to-use Laravel ZIP suite.

## 📁 Project Structure

- Root: static entry files such as [index.html](/home/shreesoftech/projects/sql-to-laravel.vercel.app/index.html), [style.css](/home/shreesoftech/projects/sql-to-laravel.vercel.app/style.css), and [README.md](/home/shreesoftech/projects/sql-to-laravel.vercel.app/README.md).
- [js](/home/shreesoftech/projects/sql-to-laravel.vercel.app/js): runtime application files such as [js/SQLParser.js](/home/shreesoftech/projects/sql-to-laravel.vercel.app/js/SQLParser.js), [js/MigrationGenerator.js](/home/shreesoftech/projects/sql-to-laravel.vercel.app/js/MigrationGenerator.js), [js/SeederGenerator.js](/home/shreesoftech/projects/sql-to-laravel.vercel.app/js/SeederGenerator.js), [js/script.js](/home/shreesoftech/projects/sql-to-laravel.vercel.app/js/script.js), and [js/SQLProcessorWorker.js](/home/shreesoftech/projects/sql-to-laravel.vercel.app/js/SQLProcessorWorker.js).
- [tests](/home/shreesoftech/projects/sql-to-laravel.vercel.app/tests): all fixtures, deterministic verification scripts, and fuzz suites.
- [tests/fixtures](/home/shreesoftech/projects/sql-to-laravel.vercel.app/tests/fixtures): vendor-specific and edge-case SQL inputs.

## ✅ Tests

Run the verification and fuzz suites from the project root:

```bash
node tests/verify-fixture.js
node tests/verify-vendor-fixtures.js
node tests/fuzz-fixtures.js
node tests/fuzz-vendor-mutations.js
node tests/fuzz-create-index-statements.js
node tests/fuzz-partial-indexes.js
```

## 📖 Usage

1. **Upload**: Drag and drop one or more `.sql` files.
2. **Configure**: Select your target Laravel version and Database environment.
3. **Generate**: Toggle between Migrations and Seeders to preview the code instantly.
4. **Export**: Download a sequential, timestamped suite of files ready for your `database/migrations` folder.

## ⚖️ License

Distributed under the MIT License. Developed by **Jayesh Mepani**.

---
*Optimized for high-stakes database migrations with 0% trade-offs in structural integrity.*
