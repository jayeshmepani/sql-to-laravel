importScripts('SQLParser.js', 'SeederGenerator.js', 'MigrationGenerator.js');

self.onmessage = event => {
    const { sqlContent = '', options = {} } = event.data || {};

    try {
        self.postMessage({ type: 'progress', progress: 10, message: 'Parsing SQL content...' });
        const parsed = SQLParser.parseSQLContent(sqlContent);

        const result = {
            tables: parsed.tables,
            seedersData: null,
            migrationsData: null
        };

        if (options.generateSeeders) {
            self.postMessage({ type: 'progress', progress: 45, message: 'Generating seeders...' });
            result.seedersData = SeederGenerator.generateAllSeeders(sqlContent);
        }

        if (options.generateMigrations) {
            self.postMessage({ type: 'progress', progress: 75, message: 'Generating migrations...' });
            result.migrationsData = Object.fromEntries(
                Object.entries(parsed.tables)
                    .map(([tableName, tableData]) => [tableName, MigrationGenerator.generate(tableName, tableData, options)])
                    .filter(([, migration]) => migration)
            );
        }

        self.postMessage({ type: 'progress', progress: 100, message: 'Processing complete!' });
        self.postMessage({ type: 'result', result });
    } catch (error) {
        self.postMessage({
            type: 'error',
            error: error?.message || 'Unknown worker error'
        });
    }
};
