/**
 * SQL to Laravel Converter - Premium Application Logic
 * Developed by Jayesh Mepani
 */

// Access global instances
const { saveAs } = window.saveAs;
const JSZip = window.JSZip;

class SQLConverter {
    constructor() {
        // Initialize state
        this.sqlFiles = []; 
        this.worker = null;
        this.tables = null;
        this.seeders = {};
        this.migrations = {};
        this.canUseWorkers = this.checkWorkerSupport();

        // Setup UI components
        this.initializeElements();
        this.attachEventListeners();
        this.initializeNavbar();

        // Background processing initialization
        if (this.canUseWorkers) {
            this.initWorker().catch(err => {
                console.warn('Worker initialization failed, using main thread fallback:', err);
                this.canUseWorkers = false;
            });
        }
    }

    checkWorkerSupport() {
        return window.location.protocol !== 'file:' &&
            typeof Worker !== 'undefined' &&
            typeof Blob !== 'undefined' &&
            typeof URL !== 'undefined';
    }

    initializeElements() {
        // Upload & Core UI
        this.uploadArea = document.getElementById('uploadArea');
        this.sqlFileInput = document.getElementById('sqlFileInput');
        this.fileInfo = document.getElementById('fileInfo');
        this.fileCount = document.getElementById('fileCount');
        this.fileList = document.getElementById('fileList');
        this.removeAllFilesBtn = document.getElementById('removeAllFiles');
        
        // Options & Actions
        this.laravelVersionSelect = document.getElementById('laravelVersion');
        this.generateSeedersCheckbox = document.getElementById('generateSeeders');
        this.generateMigrationsCheckbox = document.getElementById('generateMigrations');
        this.generateBtn = document.getElementById('generateBtn');
        this.exportBtn = document.getElementById('exportBtn');

        // Results Layout
        this.resultContainer = document.getElementById('resultContainer');
        this.seedersTab = document.getElementById('seedersTab');
        this.migrationsTab = document.getElementById('migrationsTab');
        this.seedersTabBtn = document.getElementById('seedersTabBtn');
        this.migrationsTabBtn = document.getElementById('migrationsTabBtn');
        
        // Code Previews
        this.seederCode = document.getElementById('seederCode');
        this.seederSelect = document.getElementById('seederSelect');
        this.currentSeederName = document.getElementById('currentSeederName');
        
        this.migrationCode = document.getElementById('migrationCode');
        this.migrationSelect = document.getElementById('migrationSelect');
        this.currentMigrationName = document.getElementById('currentMigrationName');

        // Progress Tracking
        this.progressContainer = document.getElementById('progressContainer');
        this.progressBar = document.getElementById('progressBar');
        this.progressText = document.getElementById('progressText');
    }

    attachEventListeners() {
        // Drag & Drop interactions
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });

        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.processMultipleFiles(e.dataTransfer.files);
        });

        // File system interactions
        this.sqlFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.processMultipleFiles(e.target.files);
        });

        this.removeAllFilesBtn.addEventListener('click', () => this.removeAllFiles());

        // Primary Action triggers
        this.generateBtn.addEventListener('click', () => this.handleGenerateClick());
        this.exportBtn.addEventListener('click', () => this.exportFiles());

        // Configuration updates
        this.generateSeedersCheckbox.addEventListener('change', () => this.updateButtons());
        this.generateMigrationsCheckbox.addEventListener('change', () => this.updateButtons());
        this.laravelVersionSelect.addEventListener('change', () => this.handleLaravelVersionChange());

        // Result selection
        this.seederSelect.addEventListener('change', () => this.displaySelectedSeeder());
        this.migrationSelect.addEventListener('change', () => this.displaySelectedMigration());

        // View Toggling
        this.seedersTabBtn.addEventListener('click', () => this.switchTab('seeders'));
        this.migrationsTabBtn.addEventListener('click', () => this.switchTab('migrations'));

        // Utility: Copy to Clipboard
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', () => this.copyCode(btn.dataset.target));
        });

        // Mobile / Touch support
        this.addTouchSupport();
    }

    addTouchSupport() {
        const labels = ['generateMigrations', 'generateSeeders'];
        labels.forEach(id => {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label) {
                label.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    const checkbox = document.getElementById(id);
                    checkbox.checked = !checkbox.checked;
                    this.updateButtons();
                });
            }
        });
    }

    initializeNavbar() {
        const navbar = document.querySelector('.navbar');
        const toggleBtn = document.getElementById('nav-toggle');
        const navLinks = document.getElementById('nav-links-desktop');

        if (!navbar || !toggleBtn || !navLinks) return;

        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) navbar.classList.add('scrolled');
            else navbar.classList.remove('scrolled');
        });

        toggleBtn.addEventListener('click', () => {
            const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
            toggleBtn.setAttribute('aria-expanded', !isExpanded);
            navLinks.classList.toggle('active');
            
            // Modern SVG icon swap
            if (!isExpanded) {
                toggleBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            } else {
                toggleBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
            }
        });
    }

    async processMultipleFiles(fileList) {
        const files = Array.from(fileList);
        const sqlFiles = files.filter(file => file.name.toLowerCase().endsWith('.sql'));
        
        if (sqlFiles.length === 0) {
            alert('Please select valid SQL files.');
            return;
        }

        try {
            for (const file of sqlFiles) {
                if (!this.sqlFiles.some(f => f.name === file.name)) {
                    const content = await FileUtils.readFile(file);
                    this.sqlFiles.push({ name: file.name, size: file.size, content: content });
                }
            }
            this.updateFileList();
            this.updateButtons();
        } catch (error) {
            console.error('File Reading Error:', error);
            alert('Failed to read SQL files.');
        }
    }

    updateFileList() {
        this.fileList.innerHTML = '';
        this.fileCount.textContent = this.sqlFiles.length;

        if (this.sqlFiles.length === 0) {
            this.fileInfo.hidden = true;
            return;
        }

        this.fileInfo.hidden = false;

        this.sqlFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14.5 2 14.5 7 20 7"></polyline></svg>
                <div style="flex-grow: 1; overflow: hidden;">
                    <p style="font-weight: 500; font-size: 0.9rem; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${file.name}</p>
                    <p style="font-size: 0.75rem; color: var(--text-muted);">${FileUtils.formatFileSize(file.size)}</p>
                </div>
                <button class="remove-btn" title="Remove">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            `;
            
            fileItem.querySelector('button').addEventListener('click', () => this.removeFile(index));
            this.fileList.appendChild(fileItem);
        });
    }

    removeFile(index) {
        this.sqlFiles.splice(index, 1);
        this.updateFileList();
        this.updateButtons();
        if (this.sqlFiles.length === 0) this.resetPreviewCode();
    }

    removeAllFiles() {
        this.sqlFiles = [];
        this.sqlFileInput.value = '';
        this.updateFileList();
        this.updateButtons();
        this.resetPreviewCode();
        if (this.worker) this.worker.terminate();
        this.worker = null;
        this.updateProgress(0);
    }

    resetPreviewCode() {
        this.seederCode.textContent = '// Generated code will appear here';
        this.migrationCode.textContent = '// Generated code will appear here';
        this.seeders = {};
        this.migrations = {};
        this.resultContainer.hidden = true;
        while (this.seederSelect.options.length > 1) this.seederSelect.remove(1);
        // Remove only options from migration select to preserve button structure
        const opts = this.migrationSelect.querySelectorAll('option');
        opts.forEach(o => o.remove());
    }

    updateButtons() {
        const hasFiles = this.sqlFiles.length > 0;
        const hasSelection = this.generateMigrationsCheckbox.checked || this.generateSeedersCheckbox.checked;
        this.generateBtn.disabled = !(hasFiles && hasSelection);
        this.exportBtn.disabled = !(hasFiles && hasSelection);
    }

    async handleGenerateClick() {
        if (this.sqlFiles.length === 0) return;
        this.generateBtn.disabled = true;
        this.resetPreviewCode();

        const options = {
            generateSeeders: this.generateSeedersCheckbox.checked,
            generateMigrations: this.generateMigrationsCheckbox.checked,
            laravelVersion: this.getSelectedLaravelVersion()
        };

        if (this.canUseWorkers) {
            await this.generateWithWorker(options);
        } else {
            await this.generateWithFallback(options);
        }
        
        this.generateBtn.disabled = false;
    }

    async generateWithWorker(options) {
        if (!this.worker) await this.initWorker();
        
        this.updateProgress(10, 'Waking up processing worker...');
        
        return new Promise((resolve) => {
            const combinedSql = this.sqlFiles.map(f => f.content).join("\n\n");
            
            // The handleWorkerMessage will resolve the promise
            this.worker.postMessage({ sqlContent: combinedSql, options });
            
            // Local resolution override if needed
            this.resolveWorker = resolve;
        });
    }

    async generateWithFallback(options) {
        this.updateProgress(5, 'Processing in main thread (High memory warning)...');
        const combinedSql = this.sqlFiles.map(file => file.content).join("\n\n");
        await this.processInChunks(combinedSql, options);
    }

    async processInChunks(sqlContent, options, chunkSize = 512 * 1024) { // 512KB chunks for safety
        const chunks = [];
        for (let i = 0; i < sqlContent.length; i += chunkSize) {
            chunks.push(sqlContent.slice(i, i + chunkSize));
        }

        let processedData = '';
        for (let i = 0; i < chunks.length; i++) {
            processedData += chunks[i];
            this.updateProgress(
                Math.floor(10 + (i / chunks.length * 20)),
                `Loading SQL chunks (${i + 1}/${chunks.length})...`
            );
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        this.updateProgress(40, 'Parsing SQL structure...');
        const parsed = SQLParser.parseSQLContent(processedData);

        if (options.generateSeeders) {
            this.updateProgress(60, 'Synthesizing seeders...');
            this.seeders = SeederGenerator.generateAllSeeders(processedData);
            this.populateSeederSelector(this.seeders);
        }

        if (options.generateMigrations) {
            this.updateProgress(80, 'Synthesizing migrations...');
            this.migrations = this.generateMigrations(parsed.tables, options);
            this.populateMigrationSelector(this.migrations);
        }

        this.showResults(options);
        this.updateProgress(100, 'Processing complete!');
    }

    showResults(options) {
        this.resultContainer.hidden = false;
        if (options.generateMigrations && !options.generateSeeders) {
            this.switchTab('migrations');
        } else {
            this.switchTab('seeders');
            this.displaySelectedSeeder(false);
        }
        this.resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    sortTablesByDependency(tables) {
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();

        const getDependencies = (tableData) => {
            const deps = new Set();
            if (tableData.foreignKeys) {
                tableData.foreignKeys.forEach(fk => {
                    const match = fk.match(/REFERENCES\s*(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s(]+))/i);
                    if (match) {
                        const depTable = match[1] || match[2] || match[3] || match[4];
                        if (tables[depTable] && depTable !== tableData.tableName) {
                            deps.add(depTable);
                        }
                    }
                });
            }
            return Array.from(deps);
        };

        const visit = (name) => {
            if (visiting.has(name)) return; // Cycle detected
            if (visited.has(name)) return;

            visiting.add(name);
            const deps = getDependencies(tables[name]);
            deps.forEach(dep => visit(dep));

            visiting.delete(name);
            visited.add(name);
            sorted.push(name);
        };

        Object.keys(tables).forEach(name => visit(name));
        return sorted;
    }

    generateMigrations(tables, options) {
        const migrations = {};
        const sortedTableNames = this.sortTablesByDependency(tables);
        
        sortedTableNames.forEach(name => {
            const code = MigrationGenerator.generate(name, tables[name], options);
            if (code) migrations[name] = code;
        });
        
        return migrations;
    }

    getSelectedLaravelVersion() {
        return parseInt(this.laravelVersionSelect.value, 10) || 13;
    }

    rebuildMigrationsForCurrentVersion() {
        if (!this.tables) return false;

        const selectedMigration = this.migrationSelect.value;
        this.migrations = this.generateMigrations(this.tables, {
            laravelVersion: this.getSelectedLaravelVersion()
        });
        this.populateMigrationSelector(this.migrations, selectedMigration);
        return true;
    }

    handleLaravelVersionChange() {
        if (Object.keys(this.migrations).length === 0) return;
        this.rebuildMigrationsForCurrentVersion();
    }

    populateSeederSelector(data) {
        const options = this.seederSelect.querySelectorAll('option');
        options.forEach((opt, index) => {
            if (opt.value !== 'database') opt.remove();
        });

        // Add icon to database option if missing
        const firstOpt = this.seederSelect.querySelector('option[value="database"]');
        if (firstOpt && !firstOpt.querySelector('.opt-icon')) {
            firstOpt.innerHTML = `
                <svg class="opt-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" 
                    stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                <span>DatabaseSeeder</span>
            `;
        }

        if (data?.seeders) {
            Object.keys(data.seeders).sort().forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.innerHTML = `
                    <svg class="opt-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" 
                        stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    <span>${SeederGenerator.formatClassName(name)}Seeder</span>
                `;
                this.seederSelect.appendChild(opt);
            });
        }
    }

    populateMigrationSelector(migrations, preferredValue = null) {
        const options = this.migrationSelect.querySelectorAll('option');
        options.forEach(opt => opt.remove());

        // Respect dependency order in the dropdown too
        Object.keys(migrations).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.innerHTML = `
                <svg class="opt-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" 
                    stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <line x1="6" y1="3" x2="6" y2="15"></line>
                    <circle cx="18" cy="6" r="3"></circle>
                    <circle cx="6" cy="18" r="3"></circle>
                    <path d="M18 9a9 9 0 0 1-9 9"></path>
                </svg>
                <span>${MigrationGenerator.formatClassName(name)}Table</span>
            `;
            this.migrationSelect.appendChild(opt);
        });
        
        if (this.migrationSelect.options.length > 0) {
            if (preferredValue && migrations[preferredValue]) {
                this.migrationSelect.value = preferredValue;
            } else {
                this.migrationSelect.selectedIndex = 0;
            }
            this.displaySelectedMigration();
        }
    }

    switchTab(tab) {
        const isSeeders = tab === 'seeders';
        this.seedersTab.hidden = !isSeeders;
        this.migrationsTab.hidden = isSeeders;
        
        this.seedersTabBtn.classList.toggle('active', isSeeders);
        this.migrationsTabBtn.classList.toggle('active', !isSeeders);
        
        this.seedersTabBtn.setAttribute('aria-selected', isSeeders);
        this.migrationsTabBtn.setAttribute('aria-selected', !isSeeders);
    }

    displaySelectedSeeder(scroll = true) {
        const val = this.seederSelect.value;
        if (val === 'database') {
            this.seederCode.textContent = this.seeders.databaseSeeder || '// Not available';
            this.currentSeederName.textContent = 'DatabaseSeeder.php';
        } else {
            this.seederCode.textContent = this.seeders.seeders?.[val] || '// Not available';
            this.currentSeederName.textContent = `${SeederGenerator.formatClassName(val)}Seeder.php`;
        }
        if (scroll) this.seederCode.closest('.code-container').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    displaySelectedMigration() {
        const val = this.migrationSelect.value;
        if (this.migrations[val]) {
            this.migrationCode.textContent = this.migrations[val];
            this.currentMigrationName.textContent = `${MigrationGenerator.formatClassName(val)}Table.php`;
        }
    }

    async copyCode(targetId) {
        const code = document.getElementById(targetId).textContent;
        try {
            await navigator.clipboard.writeText(code);
            const btn = document.querySelector(`[data-target="${targetId}"]`);
            const oldSvg = btn.innerHTML;
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => btn.innerHTML = oldSvg, 2000);
        } catch (err) {
            console.error('Clipboard Error:', err);
        }
    }

    updateProgress(percent, message) {
        if (percent === 0) {
            this.progressContainer.hidden = true;
            return;
        }
        this.progressContainer.hidden = false;
        this.progressBar.style.width = `${percent}%`;
        this.progressText.textContent = message || 'Processing...';
        if (percent >= 100) {
            setTimeout(() => {
                this.progressContainer.hidden = true;
                this.progressBar.style.width = '0%';
            }, 3000);
        }
    }

    async exportFiles() {
        this.exportBtn.disabled = true;
        try {
            this.updateProgress(10, 'Bundling for export...');
            const zip = new JSZip();
            const version = this.getSelectedLaravelVersion();
            const combinedSql = this.sqlFiles.map(f => f.content).join("\n\n");
            
            // Refresh data if state is empty
            if (this.generateSeedersCheckbox.checked && !this.seeders.databaseSeeder) {
                this.seeders = SeederGenerator.generateAllSeeders(combinedSql);
            }
            if (this.generateMigrationsCheckbox.checked) {
                const parsed = SQLParser.parseSQLContent(combinedSql);
                this.migrations = this.generateMigrations(parsed.tables, { laravelVersion: version });
            }

            if (this.seeders.databaseSeeder) {
                const folder = zip.folder('database/seeders');
                folder.file('DatabaseSeeder.php', this.seeders.databaseSeeder);
                Object.entries(this.seeders.seeders).forEach(([name, code]) => {
                    folder.file(`${SeederGenerator.formatClassName(name)}Seeder.php`, code);
                });
            }

            if (Object.keys(this.migrations).length > 0) {
                const folder = zip.folder('database/migrations');
                let ts = Date.now();
                
                // Get the migration keys in their current order (which is already sorted topologically)
                Object.entries(this.migrations).forEach(([name, code]) => {
                    const dateStr = this.formatDate(ts);
                    folder.file(`${dateStr}_create_${name}_table.php`, code);
                    ts += 1000; // Increment slightly to ensure chronological order
                });
            }

            const blob = await zip.generateAsync({ type: 'blob' });
            saveAs(blob, 'laravel-migration-suite.zip');
            this.updateProgress(100, 'Download complete!');
        } catch (error) {
            console.error('Export Error:', error);
            alert('ZIP Export failed.');
        } finally {
            this.exportBtn.disabled = false;
        }
    }

    formatDate(ts) {
        const d = new Date(ts);
        return d.getFullYear() + '_' + 
               String(d.getMonth() + 1).padStart(2, '0') + '_' + 
               String(d.getDate()).padStart(2, '0') + '_' + 
               String(d.getHours()).padStart(2, '0') + 
               String(d.getMinutes()).padStart(2, '0') + 
               String(d.getSeconds()).padStart(2, '0');
    }

    async initWorker() {
        if (this.worker) this.worker.terminate();

        try {
            this.worker = new Worker('SQLProcessorWorker.js');
            this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);
            this.worker.onerror = (err) => {
                console.error('Worker Failure:', err);
                this.canUseWorkers = false;
            };
        } catch (e) {
            this.canUseWorkers = false;
        }
    }

    handleWorkerMessage(data) {
        if (data.type === 'progress') {
            this.updateProgress(data.progress, data.message);
        } else if (data.type === 'result') {
            this.tables = data.result.tables;
            this.seeders = data.result.seedersData || {};
            
            if (this.generateMigrationsCheckbox.checked) {
                this.migrations = this.generateMigrations(this.tables, { 
                    laravelVersion: this.getSelectedLaravelVersion()
                });
            }

            this.populateSeederSelector(this.seeders);
            this.populateMigrationSelector(this.migrations);
            this.showResults({ 
                generateMigrations: this.generateMigrationsCheckbox.checked, 
                generateSeeders: this.generateSeedersCheckbox.checked 
            });
            this.updateProgress(100, 'Generation Complete!');
            if (this.resolveWorker) this.resolveWorker();
        } else if (data.type === 'error') {
            alert(`Worker Error: ${data.error}`);
            this.updateProgress(0);
        }
    }
}

// Global Application Startup
document.addEventListener('DOMContentLoaded', () => {
    window.SQLApp = new SQLConverter();
});
