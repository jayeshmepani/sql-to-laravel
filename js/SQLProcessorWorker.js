importScripts('SQLParser.js', 'SeederGenerator.js', 'MigrationGenerator.js');

self.onmessage = event => {
    const { sqlContent = '', options = {} } = event.data || {};

    try {
        self.postMessage({ type: 'progress', progress: 10, message: 'Parsing SQL content...' });
        const parsed = SQLParser.parseSQLContent(sqlContent);

        // Send back the table structure first (metadata)
        self.postMessage({ type: 'metadata', tables: Object.keys(parsed.tables) });

        if (options.generateSeeders) {
            self.postMessage({ type: 'progress', progress: 45, message: 'Generating seeders...' });
            
            const seedersData = SeederGenerator.generateAllSeeders(sqlContent, parsed);
            
            // Send DatabaseSeeder separately
            self.postMessage({ type: 'seeder-main', content: seedersData.databaseSeeder });

            // Send individual seeders one by one to avoid massive memory cloning
            for (const [tableName, content] of Object.entries(seedersData.seeders)) {
                self.postMessage({ type: 'seeder-item', tableName, content });
            }
        }

        if (options.generateMigrations) {
            self.postMessage({ type: 'progress', progress: 75, message: 'Generating migrations...' });
            
            for (const [tableName, tableData] of Object.entries(parsed.tables)) {
                const migration = MigrationGenerator.generate(tableName, tableData, { ...options, includeRawStatements: false });
                if (migration) {
                    self.postMessage({ type: 'migration-item', tableName, content: migration });
                }
            }

            const auxiliaryMigration = MigrationGenerator.generateAuxiliaryMigration(parsed, options);
            if (auxiliaryMigration) {
                self.postMessage({ type: 'auxiliary-item', tableName: '__auxiliary__', content: auxiliaryMigration });
            }
        }

        self.postMessage({ type: 'progress', progress: 100, message: 'Processing complete!' });
        self.postMessage({ type: 'complete' });
    } catch (error) {
        self.postMessage({
            type: 'error',
            error: error?.message || 'Unknown worker error'
        });
    }
};
