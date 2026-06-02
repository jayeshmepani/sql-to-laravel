class FileUtils {
    static async readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e);
            reader.readAsText(file);
        });
    }

    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }

    static formatClassName(tableName) {
        const className = String(tableName)
            .split(/[^a-zA-Z0-9]+/)
            .filter(Boolean)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');

        return /^\d/.test(className) ? `Table${className}` : (className || 'Generated');
    }

    static formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.getFullYear() +
            '_' + String(date.getMonth() + 1).padStart(2, '0') +
            '_' + String(date.getDate()).padStart(2, '0') +
            '_' + String(date.getHours()).padStart(2, '0') +
            String(date.getMinutes()).padStart(2, '0') +
            String(date.getSeconds()).padStart(2, '0');
    }

    static async exportZip(parsedOrTables, options) {
        if (!window.JSZip) {
            throw new Error('JSZip library not loaded');
        }

        const parsed = parsedOrTables && parsedOrTables.tables
            ? parsedOrTables
            : { tables: parsedOrTables || {}, globalStatements: [] };
        const tables = parsed.tables || {};
        const zip = new JSZip();
        let timestamp = Date.now();

        if (options.generateMigrations) {
            const migrationsFolder = zip.folder('migrations');
            Object.entries(tables).forEach(([tableName, table]) => {
                const migrationCode = MigrationGenerator.generate(tableName, table, { ...options, includeRawStatements: false });
                if (migrationCode) {
                    const fileName = `${this.formatTimestamp(timestamp)}_create_${tableName}_table.php`;
                    migrationsFolder.file(fileName, migrationCode);
                    timestamp += 1000;
                }
            });

            const auxiliaryMigration = MigrationGenerator.generateAuxiliaryMigration(parsed, options);
            if (auxiliaryMigration) {
                const fileName = `${this.formatTimestamp(timestamp)}_create_auxiliary_sql_objects.php`;
                migrationsFolder.file(fileName, auxiliaryMigration);
            }
        }

        if (options.generateSeeders) {
            const seedersFolder = zip.folder('seeders');
            Object.entries(tables).forEach(([tableName, table]) => {
                const seederCode = SeederGenerator.generate(tableName, table);
                if (seederCode) {
                    const fileName = `${this.formatClassName(tableName)}Seeder.php`;
                    seedersFolder.file(fileName, seederCode);
                }
            });
        }

        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, 'laravel-migration-seeder.zip');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileUtils;
} else if (typeof window !== 'undefined') {
    // Make FileUtils available globally in browser environments
    window.FileUtils = FileUtils;
}
