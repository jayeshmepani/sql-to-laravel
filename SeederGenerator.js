// Import SQLParser if in Node.js environment
if (typeof require !== 'undefined') {
    // Use let instead of var to avoid hoisting and redeclaration issues
    let SQLParserModule = require('./SQLParser');
    // Only assign if not already defined globally
    if (typeof global.SQLParser === 'undefined') {
        global.SQLParser = SQLParserModule;
    }
}
// In browser environment, SQLParser is already available globally

class SeederGenerator {
    // Alias for backward compatibility
    static generateFromSQL(sqlContent) {
        return this.generateAllSeeders(sqlContent);
    }

    static generate(tableName, tableData) {
        if (!tableData?.data?.length) {
            return null;
        }

        const className = this.formatClassName(tableName);
        const rows = tableData.insertRows?.length
            ? tableData.insertRows.map(row => ({
                columns: this.cleanColumns(row.columns || []),
                values: row.values
            }))
            : tableData.data.map(row => ({
                columns: this.cleanColumns(tableData.insertColumns || []),
                values: row
            }));

        // Check if first row contains column names - this would indicate a parsing issue
        let data = [...rows];
        if (data.length > 0 && data[0].columns.length > 0) {
            const firstRow = data[0].values;
            const firstColumns = data[0].columns;
            let isHeaderRow = true;

            // Check if the first row values match the column names
            for (let i = 0; i < Math.min(firstRow.length, firstColumns.length); i++) {
                const cellValue = String(firstRow[i]).replace(/^['"`]|['"`]$/g, '');
                if (cellValue !== firstColumns[i] &&
                    cellValue !== `\`${firstColumns[i]}\`` &&
                    cellValue.toLowerCase() !== firstColumns[i].toLowerCase()) {
                    isHeaderRow = false;
                    break;
                }
            }

            // If the first row appears to be column names, skip it
            if (isHeaderRow) {
                data = data.slice(1);
            }
        }

        const chunks = this.chunkArray(data, 100);

        return `<?php

namespace Database\\Seeders;

use Illuminate\\Database\\Seeder;
use Illuminate\\Support\\Facades\\DB;
use Illuminate\\Support\\Facades\\Schema;

class ${className}Seeder extends Seeder
{
    /**
     * Run the database seeds.
     * Populates the ${tableName} table with initial data.
     */
    public function run(): void
    {
        Schema::withoutForeignKeyConstraints(function () {
            ${this.generateInsertStatements(chunks, tableName)}
        });
    }
}`;
    }

    static cleanColumns(columns) {
        return columns.map(col => col.replace(/^`|`$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
    }

    static generateInsertStatements(chunks, tableName) {
        const escapedTable = this.escapePhpString(tableName);
        return chunks.map((chunk, index) => {
            return `DB::table('${escapedTable}')->insert([\n` +
                  chunk.map(row => this.formatRow(row.values, row.columns, 16)).join(",\n") +
                  '\n            ]);' +
                  (index < chunks.length - 1 ? '\n\n            ' : '');
        }).join('');
    }

    static formatRow(row, cleanedColumns, baseIndent = 12) {
        const rowIndent = ' '.repeat(baseIndent);
        const pairIndent = ' '.repeat(baseIndent + 4);
        if (cleanedColumns.length > 0 && cleanedColumns.length === row.length) {
            // If we have column names, create associative array
            const pairs = cleanedColumns.map((col, idx) => {
                return `${pairIndent}'${this.escapePhpString(col)}' => ${this.formatPhpValue(row[idx])}`;
            }).join(",\n");
            return `${rowIndent}[\n${pairs}\n${rowIndent}]`;
        } else {
            // Otherwise just use sequential array
            const values = row.map(val => this.formatPhpValue(val)).join(", ");
            return `${rowIndent}[${values}]`;
        }
    }

    static formatPhpValue(value) {
        if (value === null || value === 'NULL' || value === 'null') {
            return 'null';
        }

        if (typeof value === 'string') {
            // Remove quotes if present
            if ((value.startsWith("'") && value.endsWith("'")) ||
                (value.startsWith('"') && value.endsWith('"'))) {
                value = value.slice(1, -1);
            }

            // Remove backticks from values that might be column names
            value = value.replace(/^`|`$/g, '');

            // Handle special values
            if (value.toLowerCase() === 'true') return 'true';
            if (value.toLowerCase() === 'false') return 'false';
            if (/^b'[01]+'$/i.test(value)) return String(parseInt(value.slice(2, -1), 2));
            if (value.toUpperCase() === 'CURRENT_TIMESTAMP') return 'now()';

            // Handle numeric values
            if (!isNaN(value) && value.trim() !== '') return value;

            // Escape single quotes and wrap in quotes
            return `'${this.escapePhpString(value)}'`;
        }

        return value;
    }

    static chunkArray(array, size) {
        return Array.from(
            { length: Math.ceil(array.length / size) },
            (_, i) => array.slice(i * size, (i + 1) * size)
        );
    }

    static formatClassName(tableName) {
        const className = String(tableName)
            .split(/[^a-zA-Z0-9]+/)
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');

        return /^\d/.test(className) ? `Table${className}` : (className || 'Generated');
    }

    static escapePhpString(value) {
        return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    static generateDatabaseSeeder(tableNames) {
        const formattedClassNames = tableNames.map(name => this.formatClassName(name));

        return `<?php

namespace Database\\Seeders;

use Illuminate\\Database\\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run()
    {
        $this->call([
            ${formattedClassNames.map(name => `${name}Seeder::class`).join(",\n            ")}
        ]);
    }
}`;
    }

    static findTableDependencies(parsedSQL) {
        const dependencies = {};

        // Initialize empty dependency arrays for all tables
        Object.keys(parsedSQL.tables).forEach(tableName => {
            dependencies[tableName] = [];
        });

        // Extract foreign key relationships from CREATE TABLE statements
        Object.entries(parsedSQL.tables).forEach(([tableName, tableData]) => {
            if (tableData.indexes) {
                tableData.indexes.forEach(index => {
                    // Look for FOREIGN KEY constraints
                    const fkMatch = index.match(/FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s*`?([^`\s(]+)`?\s*\(/i);
                    if (fkMatch) {
                        const referencedTable = fkMatch[1];
                        if (referencedTable !== tableName && !dependencies[tableName].includes(referencedTable)) {
                            dependencies[tableName].push(referencedTable);
                        }
                    }
                });
            }
        });

        return dependencies;
    }

    static sortTablesByDependency(dependencies) {
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();

        function visit(table) {
            if (visiting.has(table)) {
                throw new Error(`Circular dependency detected involving table: ${table}`);
            }
            if (visited.has(table)) {
                return;
            }

            visiting.add(table);

            if (dependencies[table]) {
                for (const dep of dependencies[table]) {
                    visit(dep);
                }
            }

            visiting.delete(table);
            visited.add(table);
            sorted.push(table);
        }

        // Visit all tables
        Object.keys(dependencies).forEach(table => {
            if (!visited.has(table)) {
                visit(table);
            }
        });

        return sorted;
    }

    static generateAllSeeders(sqlContent) {
        const result = {
            seeders: {},
            databaseSeeder: null
        };

        // Parse the SQL content
        const parsedSQL = SQLParser.parseSQLContent(sqlContent);
        const tablesWithData = [];

        // Find table dependencies
        const dependencies = this.findTableDependencies(parsedSQL);

        // Generate individual seeders
        for (const tableName in parsedSQL.tables) {
            const tableData = parsedSQL.tables[tableName];
            if (tableData.data?.length > 0) {
                result.seeders[tableName] = this.generate(tableName, tableData);
                tablesWithData.push(tableName);
            }
        }

        if (tablesWithData.length === 0) {
            return result;
        }

        // Sort tables by dependencies and alphabetically within same dependency level
        let sortedTables;
        try {
            // First try dependency-based sorting
            sortedTables = this.sortTablesByDependency(dependencies)
                .filter(table => tablesWithData.includes(table));
        } catch (error) {
            console.warn('Dependency sorting failed, falling back to alphabetical:', error);
            // Fall back to alphabetical sorting if circular dependency is detected
            sortedTables = tablesWithData.sort((a, b) => a.localeCompare(b));
        }

        // Generate the main DatabaseSeeder with sorted tables
        if (sortedTables.length > 0) {
            result.databaseSeeder = this.generateDatabaseSeeder(sortedTables);
        }

        return result;
    }
}

// Helper function to escape HTML - needed by both class and UI
// This is used in the UI code, keeping it here for reference
/*
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
*/

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SeederGenerator;
} else if (typeof window !== 'undefined') {
    // Make SeederGenerator available globally in browser environments
    window.SeederGenerator = SeederGenerator;
}
