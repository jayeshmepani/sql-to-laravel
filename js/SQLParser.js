class SQLParser {
    static createEmptyTableStructure() {
        return {
            columns: {},
            indexes: [],
            foreignKeys: [],
            checkConstraints: [],
            rawStatements: [],
            data: [],
            insertColumns: [],
            insertRows: []
        };
    }

    static normalizeIdentifier(name) {
        if (!name) return name;

        const raw = String(name).trim();
        const parts = raw.split('.');
        return parts[parts.length - 1].trim().replace(/^["'`]|["'`]$/g, '');
    }

    static normalizeConstraintDefinition(definition) {
        if (!definition) return definition;

        return definition.replace(
            /\bREFERENCES\s+((?:`[^`]+`|"[^"]+"|'[^']+'|[a-zA-Z0-9_]+)\.)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([a-zA-Z0-9_]+))/gi,
            (_, _schema, bt, dq, sq, bare) => `REFERENCES ${bt || dq || sq || bare}`
        );
    }

    static parseSQLContent(sqlContent) {
        const tables = {};
        const globalStatements = [];
        const statements = this.splitIntoStatements(sqlContent);

        statements.forEach(stmt => {
            const trimmedStmt = stmt.trim();
            const upperStmt = trimmedStmt.toUpperCase();

            if (!trimmedStmt) {
                return;
            }

            if (upperStmt.startsWith('CREATE TABLE')) {
                const { tableName, structure } = this.parseCreateTable(trimmedStmt);
                if (tableName) {
                    tables[tableName] = this.mergeTableStructure(
                        tables[tableName] || this.createEmptyTableStructure(),
                        structure || this.createEmptyTableStructure()
                    );
                }
            } else if (upperStmt.startsWith('CREATE VIEW') || upperStmt.startsWith('DROP VIEW') || upperStmt.startsWith('CREATE TRIGGER') || upperStmt.startsWith('DROP TRIGGER')) {
                globalStatements.push(trimmedStmt);
            } else if (upperStmt.startsWith('ALTER TABLE')) {
                this.applyAlterTableStatement(tables, trimmedStmt);
            } else if (upperStmt.startsWith('DROP TABLE')) {
                this.applyDropTableStatement(tables, trimmedStmt);
            } else if (upperStmt.startsWith('DROP INDEX')) {
                this.applyDropIndexStatement(tables, trimmedStmt);
            } else if (upperStmt.startsWith('CREATE INDEX') || upperStmt.startsWith('CREATE UNIQUE INDEX')) {
                this.applyCreateIndexStatement(tables, trimmedStmt);
            } else if (upperStmt.startsWith('INSERT INTO')) {
                const { tableName, insertColumns, data } = this.parseInsert(trimmedStmt);
                if (tableName) {
                    // Create table entry if it doesn't exist
                    if (!tables[tableName]) {
                        tables[tableName] = this.createEmptyTableStructure();
                    }

                    const effectiveInsertColumns = insertColumns?.length > 0
                        ? insertColumns
                        : Object.keys(tables[tableName].columns || {});

                    // Add insert columns if available
                    if (effectiveInsertColumns.length > 0) {
                        tables[tableName].insertColumns = effectiveInsertColumns;
                    }

                    // Add data
                    if (data?.length > 0) {
                        tables[tableName].data ??= [];
                        tables[tableName].data.push(...data);
                        tables[tableName].insertRows ??= [];
                        data.forEach(row => {
                            tables[tableName].insertRows.push({
                                columns: effectiveInsertColumns,
                                values: row
                            });
                        });
                    }
                }
            } else if (
                upperStmt === 'COMMIT' ||
                upperStmt === 'BEGIN' ||
                upperStmt.startsWith('BEGIN ') ||
                upperStmt.startsWith('START TRANSACTION') ||
                upperStmt.startsWith('SET ') ||
                upperStmt.startsWith('LOCK TABLES') ||
                upperStmt.startsWith('UNLOCK TABLES')
            ) {
                // Transaction and session-control statements do not change the schema snapshot.
            } else {
                globalStatements.push(trimmedStmt);
            }
        });

        return { tables, globalStatements };
    }

    static mergeTableStructure(base, patch) {
        const merged = {
            ...this.createEmptyTableStructure(),
            ...base,
            ...patch,
            columns: { ...(base?.columns || {}), ...(patch?.columns || {}) },
            indexes: [...(base?.indexes || [])],
            foreignKeys: [...(base?.foreignKeys || [])],
            checkConstraints: [...(base?.checkConstraints || [])],
            rawStatements: [...(base?.rawStatements || [])],
            data: [...(base?.data || [])],
            insertColumns: patch?.insertColumns?.length ? [...patch.insertColumns] : [...(base?.insertColumns || [])],
            insertRows: [...(base?.insertRows || [])]
        };

        for (const listName of ['indexes', 'foreignKeys', 'checkConstraints', 'rawStatements']) {
            for (const entry of patch?.[listName] || []) {
                if (!merged[listName].includes(entry)) {
                    merged[listName].push(entry);
                }
            }
        }

        if (patch?.data?.length) {
            merged.data.push(...patch.data);
        }

        if (patch?.insertRows?.length) {
            merged.insertRows.push(...patch.insertRows);
        }

        return merged;
    }

    static canImplicitlyTerminateStatement(statement) {
        const trimmed = statement.trim();
        if (!trimmed) return false;

        if (/^ALTER\s+TABLE\s+(?:ONLY\s+)?(?:`[^`]+`|"[^"]+"|'[^']+'|[^\s;]+)\s*$/i.test(trimmed)) {
            return false;
        }

        if (/^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?$/i.test(trimmed)) {
            return false;
        }

        return true;
    }

    static splitIntoStatements(sqlContent) {
        const statements = [];
        const currentStatementParts = [];
        let inString = false;
        let stringChar = '';
        let parenDepth = 0;
        let inLineComment = false;
        let inBlockComment = false;

        const len = sqlContent.length;
        for (let i = 0; i < len; i++) {
            const char = sqlContent[i];
            const nextChar = sqlContent[i + 1] || '';

            // Handle block comments /* ... */
            if (!inString && !inLineComment) {
                if (!inBlockComment && char === '/' && nextChar === '*') {
                    inBlockComment = true;
                    i++;
                    continue;
                }
                if (inBlockComment && char === '*' && nextChar === '/') {
                    inBlockComment = false;
                    i++;
                    continue;
                }
            }
            if (inBlockComment) continue;

            // Handle line comments -- or #
            if (!inString && !inBlockComment) {
                if (!inLineComment && ((char === '-' && nextChar === '-') || char === '#')) {
                    inLineComment = true;
                    continue;
                }
                if (inLineComment && (char === '\n' || char === '\r')) {
                    inLineComment = false;
                }
            }
            if (inLineComment) continue;

            // Handle string literals — correctly handle escaped backslashes
            if ((char === "'" || char === '"')) {
                let backslashCount = 0;
                // Optimization: only check backslashes if the character could be an end quote
                for (let j = i - 1; j >= 0 && sqlContent[j] === '\\'; j--) {
                    backslashCount++;
                }
                const isEscaped = backslashCount % 2 !== 0;

                if (!isEscaped) {
                    if (!inString) {
                        inString = true;
                        stringChar = char;
                    } else if (char === stringChar) {
                        inString = false;
                    }
                }
            }

            if (!inString) {
                if (char === '(') parenDepth++;
                else if (char === ')') parenDepth--;
            }

            currentStatementParts.push(char);

            // If we encounter a semicolon outside of a string and at depth 0
            if (char === ';' && !inString && parenDepth === 0) {
                const stmt = currentStatementParts.join('').trim();
                if (stmt && stmt !== ';') {
                    statements.push(stmt);
                }
                currentStatementParts.length = 0;
            }
            // Heuristic for missing semicolons: if we see CREATE TABLE or INSERT INTO at depth 0 
            // and the current buffer has significant content, it might be a new statement.
            // OPTIMIZATION: Use a small slice (100 chars) for lookahead instead of slicing to the end.
            else if (!inString && parenDepth === 0 && i < len - 15) {
                // Peek ahead only if current char is a potential statement boundary (like newline or semicolon-less gap)
                if (char === '\n' || char === '\r' || char === ' ') {
                    const peek = sqlContent.slice(i + 1, i + 100).trimStart().toUpperCase();
                    if (
                        peek.startsWith('CREATE TABLE') ||
                        peek.startsWith('ALTER TABLE') ||
                        peek.startsWith('DROP TABLE') ||
                        peek.startsWith('DROP INDEX') ||
                        peek.startsWith('CREATE INDEX') ||
                        peek.startsWith('CREATE UNIQUE INDEX') ||
                        peek.startsWith('INSERT INTO') ||
                        peek.startsWith('COMMIT')
                    ) {
                        const stmt = currentStatementParts.join('').trim();
                        if (stmt && this.canImplicitlyTerminateStatement(stmt)) {
                            statements.push(stmt);
                            currentStatementParts.length = 0;
                        }
                    }
                }
            }
        }

        // Add the last statement if it exists
        const lastStmt = currentStatementParts.join('').trim();
        if (lastStmt && lastStmt !== ';') {
            statements.push(lastStmt);
        }

        return statements.filter(stmt => stmt.trim().length > 0);
    }

    static parseCreateTable(statement) {
        if (/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s(]+))\s+AS\s+SELECT\b/i.test(statement)) {
            const match = statement.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s(]+))\s+AS\s+SELECT\b/i);
            const tableName = this.normalizeIdentifier(match[1] || match[2] || match[3] || match[4]);
            return {
                tableName,
                structure: {
                    ...this.createEmptyTableStructure(),
                    rawStatements: [statement.trim().replace(/;$/, '')]
                }
            };
        }

        // Enhanced regex to handle quoted identifiers and backticks
        const tableMatch = statement.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s(]+))\s*\(([\s\S]+)\)/i);
        if (!tableMatch) return {};

        const tableName = this.normalizeIdentifier(tableMatch[1] || tableMatch[2] || tableMatch[3] || tableMatch[4]);
        let columnsString = tableMatch[5];
        
        // Remove trailing engine/charset info if it's still there after the last paren
        // (The regex above might include it if there's no closing paren or something, but usually it stops at the last paren)
        // Actually our regex is greedy ([\s\S]+). We need to find the matching closing paren for the table.
        const firstParenIndex = statement.indexOf('(');
        const lastParenIndex = this.findMatchingParen(statement, firstParenIndex);
        if (lastParenIndex !== -1) {
            columnsString = statement.slice(firstParenIndex + 1, lastParenIndex);
        }

        const structure = this.createEmptyTableStructure();

        // Split column definitions and process
        this.splitColumnDefinitions(columnsString).forEach(def => {
            const trimmedDef = def.trim();

            // Handle foreign key constraints
            if (/^(?:CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|'[^']+'|[^\s]+)\s+)?FOREIGN\s+KEY/i.test(trimmedDef)) {
                const normalized = this.normalizeConstraintDefinition(trimmedDef);
                structure.foreignKeys.push(normalized);
                structure.indexes.push(normalized);
                return;
            }

            // Handle indexes and constraints
            if (/^(PRIMARY KEY|KEY|UNIQUE(?:\s+KEY)?|UNIQUE(?:\s+INDEX)?|INDEX|FULLTEXT(?:\s+KEY|\s+INDEX)?|SPATIAL(?:\s+KEY|\s+INDEX)?)/i.test(trimmedDef)) {
                structure.indexes.push(this.normalizeConstraintDefinition(trimmedDef));
                return;
            }
            
            // Handle CHECK constraints
            if (/^(?:CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|'[^']+'|[^\s]+)\s+)?CHECK/i.test(trimmedDef)) {
                structure.checkConstraints.push(this.normalizeConstraintDefinition(trimmedDef));
                return;
            }

            if (/^CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|'[^']+'|[^\s]+)\s+(PRIMARY\s+KEY|UNIQUE(?:\s+KEY|\s+INDEX)?|UNIQUE(?:\s+INDEX)?|FOREIGN\s+KEY|CHECK)\b/i.test(trimmedDef)) {
                const normalized = this.normalizeConstraintDefinition(trimmedDef);

                if (/\bFOREIGN\s+KEY\b/i.test(normalized)) {
                    structure.foreignKeys.push(normalized);
                    structure.indexes.push(normalized);
                } else if (/\bCHECK\b/i.test(normalized)) {
                    structure.checkConstraints.push(normalized);
                } else {
                    structure.indexes.push(normalized);
                }
                return;
            }

            const parsedColumn = this.parseColumnDefinition(trimmedDef);
            if (parsedColumn) {
                const { columnName, definition } = parsedColumn;

                // Check for inline UNIQUE or PRIMARY KEY
                if (/\bUNIQUE\b/i.test(definition)) {
                    structure.indexes.push(`UNIQUE KEY \`${columnName}_unique\` (\`${columnName}\`)`);
                }
                if (/\bPRIMARY\s+KEY\b/i.test(definition)) {
                    structure.indexes.push(`PRIMARY KEY (\`${columnName}\`)`);
                }

                const typeInfo = this.parseColumnType(definition);
                structure.columns[columnName] = typeInfo;
            }        });

        // Promote longtext to json if a json_valid check exists
        structure.checkConstraints.forEach(check => {
            const jsonValidMatch = check.match(/json_valid\s*\(\s*(?:`([^`]+)`|"([^"]+)"|'([^']+)'|(\w+))\s*\)/i);
            if (jsonValidMatch) {
                const colName = jsonValidMatch[1] || jsonValidMatch[2] || jsonValidMatch[3] || jsonValidMatch[4];
                if (structure.columns[colName]) {
                    structure.columns[colName].type = 'json';
                }
            }
        });

        return { tableName, structure };
    }

    static parseAlterTable(statement) {
        const tableMatch = statement.match(/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))\s+([\s\S]+)$/i);
        if (!tableMatch) return {};

        const tableName = this.normalizeIdentifier(tableMatch[1] || tableMatch[2] || tableMatch[3] || tableMatch[4]);
        const operationsString = tableMatch[5].trim().replace(/;$/, '');
        const structure = this.createEmptyTableStructure();
        const operations = this.splitColumnDefinitions(operationsString);

        operations.forEach(operation => {
            const trimmedOp = operation.trim();
            if (!trimmedOp) return;

            if (/^ADD\s+(?:CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|'[^']+'|[^\s]+)\s+)?FOREIGN\s+KEY/i.test(trimmedOp)) {
                const normalized = this.normalizeConstraintDefinition(trimmedOp.replace(/^ADD\s+/i, '').trim());
                structure.foreignKeys.push(normalized);
                structure.indexes.push(normalized);
                return;
            }

            if (/^ADD\s+(PRIMARY\s+KEY|UNIQUE(?:\s+KEY|\s+INDEX)?|KEY|INDEX|FULLTEXT(?:\s+KEY|\s+INDEX)?|SPATIAL(?:\s+KEY|\s+INDEX)?)/i.test(trimmedOp)) {
                structure.indexes.push(this.normalizeConstraintDefinition(trimmedOp.replace(/^ADD\s+/i, '').trim()));
                return;
            }

            if (/^ADD\s+CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|'[^']+'|[^\s]+)\s+(PRIMARY\s+KEY|UNIQUE(?:\s+KEY|\s+INDEX)?|UNIQUE(?:\s+INDEX)?|CHECK)\b/i.test(trimmedOp)) {
                const normalized = this.normalizeConstraintDefinition(trimmedOp.replace(/^ADD\s+/i, '').trim());
                if (/\bCHECK\b/i.test(normalized)) {
                    structure.checkConstraints.push(normalized);
                } else {
                    structure.indexes.push(normalized);
                }
                return;
            }

            if (/^(?:MODIFY|CHANGE)\s+/i.test(trimmedOp)) {
                const parsedColumn = this.parseAlterColumnOperation(trimmedOp);
                if (parsedColumn) {
                    const existing = structure.columns[parsedColumn.columnName] || {};
                    structure.columns[parsedColumn.columnName] = {
                        ...existing,
                        ...parsedColumn.definition
                    };
                }
            }
        });

        return { tableName, structure, operations };
    }

    static applyAlterTableStatement(tables, statement) {
        const parsed = this.parseAlterTable(statement);
        if (!parsed.tableName) return;

        const originalTableName = parsed.tableName;
        const structure = tables[originalTableName] || this.createEmptyTableStructure();
        const operations = parsed.operations || [];
        let currentTableName = originalTableName;

        operations.forEach(operation => {
            const trimmedOp = operation.trim();
            if (!trimmedOp) return;

            if (/^ADD\s+/i.test(trimmedOp)) {
                this.applyAddOperation(structure, trimmedOp);
                return;
            }

            if (/^(?:MODIFY|CHANGE)\s+/i.test(trimmedOp)) {
                this.applyAlterColumnMutation(structure, trimmedOp);
                return;
            }

            if (/^DROP\s+/i.test(trimmedOp)) {
                this.applyDropOperation(structure, trimmedOp);
                return;
            }

            const renameColumnMatch = trimmedOp.match(/^RENAME\s+COLUMN\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))\s+TO\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))$/i);
            if (renameColumnMatch) {
                const oldColumnName = renameColumnMatch[1] || renameColumnMatch[2] || renameColumnMatch[3] || renameColumnMatch[4];
                const newColumnName = renameColumnMatch[5] || renameColumnMatch[6] || renameColumnMatch[7] || renameColumnMatch[8];
                if (structure.columns[oldColumnName]) {
                    structure.columns[newColumnName] = structure.columns[oldColumnName];
                    delete structure.columns[oldColumnName];
                }
                this.renameColumnReferences(structure, oldColumnName, newColumnName);
                return;
            }

            const renameMatch = trimmedOp.match(/^(?:RENAME\s+TO|RENAME\s+(?:AS\s+)?)\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))$/i);
            if (renameMatch) {
                currentTableName = this.normalizeIdentifier(renameMatch[1] || renameMatch[2] || renameMatch[3] || renameMatch[4]);
            }
        });

        if (currentTableName !== originalTableName) {
            delete tables[originalTableName];
        }
        tables[currentTableName] = structure;
    }

    static applyAddOperation(structure, operation) {
        const trimmedOp = operation.trim();

        if (/^ADD\s+(?:CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|'[^']+'|[^\s]+)\s+)?FOREIGN\s+KEY/i.test(trimmedOp)) {
            const normalized = this.normalizeConstraintDefinition(trimmedOp.replace(/^ADD\s+/i, '').trim());
            this.addUniqueEntry(structure.foreignKeys, normalized);
            this.addUniqueEntry(structure.indexes, normalized);
            return;
        }

        if (/^ADD\s+(?:CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|'[^']+'|[^\s]+)\s+)?CHECK/i.test(trimmedOp)) {
            this.addUniqueEntry(structure.checkConstraints, this.normalizeConstraintDefinition(trimmedOp.replace(/^ADD\s+/i, '').trim()));
            return;
        }

        if (/^ADD\s+(PRIMARY\s+KEY|UNIQUE(?:\s+KEY|\s+INDEX)?|KEY|INDEX|FULLTEXT(?:\s+KEY|\s+INDEX)?|SPATIAL(?:\s+KEY|\s+INDEX)?)/i.test(trimmedOp)) {
            this.addUniqueEntry(structure.indexes, this.normalizeConstraintDefinition(trimmedOp.replace(/^ADD\s+/i, '').trim()));
            return;
        }

        if (/^ADD\s+CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|'[^']+'|[^\s]+)\s+(PRIMARY\s+KEY|UNIQUE(?:\s+KEY|\s+INDEX)?|UNIQUE(?:\s+INDEX)?|CHECK)\b/i.test(trimmedOp)) {
            const normalized = this.normalizeConstraintDefinition(trimmedOp.replace(/^ADD\s+/i, '').trim());
            if (/\bCHECK\b/i.test(normalized)) {
                this.addUniqueEntry(structure.checkConstraints, normalized);
            } else {
                this.addUniqueEntry(structure.indexes, normalized);
            }
            return;
        }

        const columnMatch = trimmedOp.match(/^ADD\s+(?:COLUMN\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))\s+([\s\S]+)$/i);
        if (!columnMatch) return;

        const columnName = columnMatch[1] || columnMatch[2] || columnMatch[3] || columnMatch[4];
        const definition = columnMatch[5].trim();
        structure.columns[columnName] = this.parseColumnType(definition);
        this.extractInlineConstraintsIntoStructure(structure, columnName, definition);
    }

    static applyAlterColumnMutation(structure, operation) {
        const parsedColumn = this.parseAlterColumnOperation(operation);
        if (!parsedColumn) return;

        const existing = structure.columns[parsedColumn.columnName] || {};
        if (parsedColumn.oldColumnName && parsedColumn.oldColumnName !== parsedColumn.columnName) {
            delete structure.columns[parsedColumn.oldColumnName];
            this.renameColumnReferences(structure, parsedColumn.oldColumnName, parsedColumn.columnName);
        }

        structure.columns[parsedColumn.columnName] = {
            ...existing,
            ...parsedColumn.definition
        };
    }

    static applyDropOperation(structure, operation) {
        const trimmedOp = operation.trim();

        if (/^DROP\s+PRIMARY\s+KEY/i.test(trimmedOp)) {
            structure.indexes = structure.indexes.filter(idx => !/^PRIMARY\s+KEY/i.test(idx));
            return;
        }

        const dropForeignMatch = trimmedOp.match(/^DROP\s+FOREIGN\s+KEY\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        if (dropForeignMatch) {
            const constraintName = dropForeignMatch[1] || dropForeignMatch[2] || dropForeignMatch[3] || dropForeignMatch[4];
            structure.foreignKeys = structure.foreignKeys.filter(fk => !this.constraintMatchesName(fk, constraintName));
            structure.indexes = structure.indexes.filter(idx => !this.constraintMatchesName(idx, constraintName));
            return;
        }

        const dropConstraintMatch = trimmedOp.match(/^DROP\s+CONSTRAINT\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        if (dropConstraintMatch) {
            const constraintName = dropConstraintMatch[1] || dropConstraintMatch[2] || dropConstraintMatch[3] || dropConstraintMatch[4];
            structure.foreignKeys = structure.foreignKeys.filter(fk => !this.constraintMatchesName(fk, constraintName));
            structure.indexes = structure.indexes.filter(idx => !this.constraintMatchesName(idx, constraintName));
            structure.checkConstraints = structure.checkConstraints.filter(check => !this.constraintMatchesName(check, constraintName));
            structure.rawStatements = (structure.rawStatements || []).filter(stmt => !this.rawStatementMatchesIndexName(stmt, constraintName));
            return;
        }

        const dropIndexMatch = trimmedOp.match(/^DROP\s+(?:INDEX|KEY)\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        if (dropIndexMatch) {
            const indexName = dropIndexMatch[1] || dropIndexMatch[2] || dropIndexMatch[3] || dropIndexMatch[4];
            structure.indexes = structure.indexes.filter(idx => !this.indexMatchesName(idx, indexName));
            return;
        }

        const dropColumnMatch = trimmedOp.match(/^DROP\s+(?:COLUMN\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        if (dropColumnMatch) {
            const columnName = dropColumnMatch[1] || dropColumnMatch[2] || dropColumnMatch[3] || dropColumnMatch[4];
            delete structure.columns[columnName];
            this.removeColumnReferences(structure, columnName);
        }
    }

    static applyDropTableStatement(tables, statement) {
        const tableListMatch = statement.match(/^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\s\S]+)$/i);
        if (!tableListMatch) return;
        const tableNames = this.extractIdentifierList(tableListMatch[1].replace(/;$/, ''));
        tableNames.forEach(tableName => {
            delete tables[this.normalizeIdentifier(tableName)];
        });
    }

    static applyDropIndexStatement(tables, statement) {
        const normalizedStatement = statement.trim().replace(/;$/, '');
        const scopedMatch = normalizedStatement.match(/^DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))\s+ON\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s;]+))/i);
        if (scopedMatch) {
            const indexName = scopedMatch[1] || scopedMatch[2] || scopedMatch[3] || scopedMatch[4];
            const tableName = this.normalizeIdentifier(scopedMatch[5] || scopedMatch[6] || scopedMatch[7] || scopedMatch[8]);
            if (!tables[tableName]) return;
            tables[tableName].indexes = tables[tableName].indexes.filter(idx => !this.indexMatchesName(idx, indexName));
            tables[tableName].rawStatements = (tables[tableName].rawStatements || []).filter(stmt => !this.rawStatementMatchesIndexName(stmt, indexName));
            return;
        }

        const globalMatch = normalizedStatement.match(/^DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s;]+))$/i);
        if (!globalMatch) return;

        const indexName = globalMatch[1] || globalMatch[2] || globalMatch[3] || globalMatch[4];
        Object.values(tables).forEach(table => {
            table.indexes = (table.indexes || []).filter(idx => !this.indexMatchesName(idx, indexName));
            table.rawStatements = (table.rawStatements || []).filter(stmt => !this.rawStatementMatchesIndexName(stmt, indexName));
        });
    }

    static applyCreateIndexStatement(tables, statement) {
        const normalizedStatement = statement.trim().replace(/;$/, '');
        const match = normalizedStatement.match(
            /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))\s+ON\s+(?:ONLY\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s(]+))\s*(?:USING\s+\w+\s*)?\(([\s\S]+?)\)\s*(?:WHERE\s+([\s\S]+))?$/i
        );
        if (!match) return;

        const isUnique = Boolean(match[1]);
        const indexName = match[2] || match[3] || match[4] || match[5];
        const tableName = this.normalizeIdentifier(match[6] || match[7] || match[8] || match[9]);
        const columns = match[10]
            .split(',')
            .map(column => column.trim())
            .filter(Boolean)
            .map(column => {
                const simpleColumnMatch = column.match(/^(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([a-zA-Z0-9_]+))$/);
                const simpleColumn = simpleColumnMatch
                    ? (simpleColumnMatch[1] || simpleColumnMatch[2] || simpleColumnMatch[3] || simpleColumnMatch[4])
                    : column.replace(/\s+(ASC|DESC)\b/i, '').trim();
                return `\`${this.normalizeIdentifier(simpleColumn)}\``;
            });

        if (!tables[tableName]) {
            tables[tableName] = this.createEmptyTableStructure();
        }

        const innerExpression = (match[10] || '').trim();
        if (/\bWHERE\b/i.test(normalizedStatement) || /[()]/.test(innerExpression.replace(/^\(/, '').replace(/\)$/, ''))) {
            tables[tableName].rawStatements.push(normalizedStatement);
            return;
        }

        const definition = `${isUnique ? 'UNIQUE ' : ''}INDEX \`${indexName}\` (${columns.join(', ')})`;
        this.addUniqueEntry(tables[tableName].indexes, definition);
    }

    static parseAlterColumnOperation(operation) {
        const modifyMatch = operation.match(/^MODIFY\s+(?:COLUMN\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))\s+([\s\S]+)$/i);
        if (modifyMatch) {
            const columnName = modifyMatch[1] || modifyMatch[2] || modifyMatch[3] || modifyMatch[4];
            return {
                columnName,
                definition: this.parseColumnType(modifyMatch[5].trim())
            };
        }

        const changeMatch = operation.match(/^CHANGE\s+(?:COLUMN\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))\s+([\s\S]+)$/i);
        if (changeMatch) {
            const oldColumnName = changeMatch[1] || changeMatch[2] || changeMatch[3] || changeMatch[4];
            const newColumnName = changeMatch[5] || changeMatch[6] || changeMatch[7] || changeMatch[8];
            return {
                oldColumnName,
                columnName: newColumnName,
                definition: this.parseColumnType(changeMatch[9].trim())
            };
        }

        return null;
    }

    static extractInlineConstraintsIntoStructure(structure, columnName, definition) {
        if (/\bUNIQUE\b/i.test(definition)) {
            this.addUniqueEntry(structure.indexes, `UNIQUE KEY \`${columnName}_unique\` (\`${columnName}\`)`);
        }
        if (/\bPRIMARY\s+KEY\b/i.test(definition)) {
            this.addUniqueEntry(structure.indexes, `PRIMARY KEY (\`${columnName}\`)`);
        }
    }

    static extractIdentifierList(value) {
        const identifiers = [];
        const pattern = /`([^`]+)`|"([^"]+)"|'([^']+)'|([a-zA-Z0-9_.-]+)/g;
        let match;
        while ((match = pattern.exec(value)) !== null) {
            identifiers.push(match[1] || match[2] || match[3] || match[4]);
        }
        return identifiers;
    }

    static addUniqueEntry(target, value) {
        if (!target.includes(value)) {
            target.push(value);
        }
    }

    static constraintMatchesName(definition, name) {
        const match = definition.match(/CONSTRAINT\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))/i);
        if (!match) return false;
        return (match[1] || match[2] || match[3] || match[4]) === name;
    }

    static indexMatchesName(definition, name) {
        const match = definition.match(/(?:KEY|INDEX)\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s(]+))/i);
        if (!match) return false;
        return (match[1] || match[2] || match[3] || match[4]) === name;
    }

    static rawStatementMatchesIndexName(statement, name) {
        const match = statement.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))/i);
        if (!match) return false;
        return (match[1] || match[2] || match[3] || match[4]) === name;
    }

    static removeColumnReferences(structure, columnName) {
        const columnPattern = new RegExp(`(?:\`${this.escapeRegExp(columnName)}\`|\"${this.escapeRegExp(columnName)}\"|'${this.escapeRegExp(columnName)}'|\\b${this.escapeRegExp(columnName)}\\b)`, 'i');
        structure.indexes = structure.indexes.filter(idx => !columnPattern.test(idx));
        structure.foreignKeys = structure.foreignKeys.filter(fk => !columnPattern.test(fk));
        structure.checkConstraints = structure.checkConstraints.filter(check => !columnPattern.test(check));
    }

    static renameColumnReferences(structure, oldColumnName, newColumnName) {
        const oldPattern = new RegExp(`(\`|\"|')?${this.escapeRegExp(oldColumnName)}(\\1|\\b)`, 'g');
        const replaceRef = value => value.replace(oldPattern, match => {
            if (match.startsWith('`') && match.endsWith('`')) return `\`${newColumnName}\``;
            if (match.startsWith('"') && match.endsWith('"')) return `"${newColumnName}"`;
            if (match.startsWith("'") && match.endsWith("'")) return `'${newColumnName}'`;
            return newColumnName;
        });

        structure.indexes = structure.indexes.map(replaceRef);
        structure.foreignKeys = structure.foreignKeys.map(replaceRef);
        structure.checkConstraints = structure.checkConstraints.map(replaceRef);
    }

    static escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    static parseColumnDefinition(definition) {
        const match = definition.match(/^(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))\s+([\s\S]+)$/);
        if (!match) return null;

        return {
            columnName: match[1] || match[2] || match[3] || match[4],
            definition: match[5].trim()
        };
    }

    static parseColumnType(definition, legacyAttributes = '') {
        const normalizedDefinition = `${definition || ''} ${legacyAttributes || ''}`.trim();
        const typeInfo = {
            type: '',
            length: null,
            values: null,
            unsigned: false,
            nullable: true,
            default: null,
            hasDefault: false,
            autoIncrement: false,
            onUpdate: null,
            identityGeneration: null,
            virtualAs: null,
            storedAs: null,
            invisible: false,
            lock: null,
            instant: false,
            collation: null,
            charset: null,
            dimensions: null
        };

        const parsedType = this.extractTypeAndAttributes(normalizedDefinition);
        if (!parsedType) return typeInfo;

        typeInfo.type = parsedType.type;
        const typeArgs = parsedType.args;
        const attributes = parsedType.attributes;

        if (/\bNOT\s+NULL\b/i.test(attributes)) {
            typeInfo.nullable = false;
        } else if (/\bNULL\b/i.test(attributes)) {
            typeInfo.nullable = true;
        }

        if (/\bAUTO_INCREMENT\b/i.test(attributes)) {
            typeInfo.autoIncrement = true;
        }

        if (['serial', 'bigserial', 'smallserial'].includes(typeInfo.type)) {
            typeInfo.autoIncrement = true;
        }

        if (typeArgs) {
            if (typeInfo.type === 'enum' || typeInfo.type === 'set') {
                typeInfo.values = this.parseSQLValueList(typeArgs);
            } else if (/^[\d\s,]+$/.test(typeArgs)) {
                const lengths = typeArgs.split(',').map(value => Number(value.trim()));
                typeInfo.length = lengths.length === 1 ? lengths[0] : lengths;
            }
        } else if (typeInfo.type === 'varchar') {
            typeInfo.length = 255;
        }

        typeInfo.unsigned = /\bunsigned\b/i.test(attributes);

        const defaultInfo = this.extractDefaultValue(attributes);
        typeInfo.default = defaultInfo.value;
        typeInfo.hasDefault = defaultInfo.found;

        const onUpdateMatch = attributes.match(/\bON\s+UPDATE\s+(.+?)(?:\s+COMMENT\b|\s+COLLATE\b|\s+CHARACTER\b|$)/i);
        if (onUpdateMatch) {
            typeInfo.onUpdate = this.normalizeSQLExpression(onUpdateMatch[1].trim());
        }

        const commentMatch = attributes.match(/\bCOMMENT\s+(['"])(.*?)\1/i);
        if (commentMatch) {
            typeInfo.comment = commentMatch[2];
        }

        const charsetMatch = attributes.match(/\b(?:CHARACTER\s+SET|CHARSET)\s+(['"]?)([\w_]+)\1/i);
        if (charsetMatch) {
            typeInfo.charset = charsetMatch[2];
        }

        const collationMatch = attributes.match(/\bCOLLATE\s+(['"]?)([\w_]+)\1/i);
        if (collationMatch) {
            typeInfo.collation = collationMatch[2];
        }

        const identityMatch = attributes.match(/\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i);
        if (identityMatch) {
            typeInfo.identityGeneration = identityMatch[1].replace(/\s+/g, '').toLowerCase();
        }

        const computedGeneratedMatch = attributes.match(/\bGENERATED\s+(?:ALWAYS\s+)?AS\s+/i);
        if (computedGeneratedMatch && !/\bAS\s+IDENTITY\b/i.test(attributes)) {
            const afterAs = attributes.slice(computedGeneratedMatch.index + computedGeneratedMatch[0].length).trimStart();
            if (afterAs.startsWith('(')) {
                const closeIdx = this.findMatchingParen(afterAs, 0);
                if (closeIdx !== -1) {
                    const expr = afterAs.slice(1, closeIdx);
                    if (/\bSTORED\b/i.test(attributes)) {
                        typeInfo.storedAs = expr;
                    } else {
                        typeInfo.virtualAs = expr;
                    }
                }
            }
        }

        const virtualAsMatch = attributes.match(/\bVIRTUAL\s+AS\s+/i);
        if (virtualAsMatch) {
            const afterAs = attributes.slice(virtualAsMatch.index + virtualAsMatch[0].length).trimStart();
            if (afterAs.startsWith('(')) {
                const closeIdx = this.findMatchingParen(afterAs, 0);
                if (closeIdx !== -1) typeInfo.virtualAs = afterAs.slice(1, closeIdx);
            }
        }

        const storedAsMatch = attributes.match(/\bSTORED\s+AS\s+/i);
        if (storedAsMatch) {
            const afterAs = attributes.slice(storedAsMatch.index + storedAsMatch[0].length).trimStart();
            if (afterAs.startsWith('(')) {
                const closeIdx = this.findMatchingParen(afterAs, 0);
                if (closeIdx !== -1) typeInfo.storedAs = afterAs.slice(1, closeIdx);
            }
        }

        if (/\bINVISIBLE\b/i.test(attributes)) {
            typeInfo.invisible = true;
        }

        const lockMatch = attributes.match(/\bLOCK\s+(NONE|SHARE|SHARED|DEFAULT|EXCLUSIVE|UPDATE)\b/i);
        if (lockMatch) {
            typeInfo.lock = lockMatch[1].toLowerCase() === 'share'
                ? 'shared'
                : lockMatch[1].toLowerCase();
        }

        if (/\bINSTANT\b/i.test(attributes)) {
            typeInfo.instant = true;
        }

        return typeInfo;
    }

    static extractTypeAndAttributes(definition) {
        const normalized = definition.toLowerCase();
        const pgTypes = [
            ['timestamp without time zone', 'timestamp'],
            ['timestamp with time zone', 'timestamptz'],
            ['time without time zone', 'time'],
            ['time with time zone', 'timetz'],
            ['double precision', 'double precision'],
            ['character varying', 'character varying'],
            ['bit varying', 'bit varying'],
            ['bigserial', 'bigserial'],
            ['smallserial', 'smallserial'],
            ['serial', 'serial'],
            ['timestamptz', 'timestamptz'],
            ['timetz', 'timetz'],
            ['money', 'money'],
            ['geography', 'geography'],
            ['tsvector', 'tsvector']
        ];

        for (const [sqlType, normalizedType] of pgTypes) {
            if (normalized.startsWith(sqlType)) {
                let rest = definition.slice(sqlType.length).trimStart();
                let args = null;

                if (rest.startsWith('(')) {
                    const closingIndex = this.findMatchingParen(rest, 0);
                    if (closingIndex !== -1) {
                        args = rest.slice(1, closingIndex);
                        rest = rest.slice(closingIndex + 1).trimStart();
                    }
                }

                return { type: normalizedType, args, attributes: rest };
            }
        }

        const typeMatch = definition.match(/^([a-zA-Z]+)(?:\s+([a-zA-Z]+))?/);
        if (!typeMatch) return null;

        let type = typeMatch[1].toLowerCase();
        let consumed = typeMatch[1].length;
        const secondWord = typeMatch[2]?.toLowerCase();

        if (
            (type === 'character' && secondWord === 'varying') ||
            (type === 'double' && secondWord === 'precision')
        ) {
            type = `${type} ${secondWord}`;
            consumed = typeMatch[0].length;
        }

        let rest = definition.slice(consumed).trimStart();
        let args = null;

        if (rest.startsWith('(')) {
            const closingIndex = this.findMatchingParen(rest, 0);
            if (closingIndex !== -1) {
                args = rest.slice(1, closingIndex);
                rest = rest.slice(closingIndex + 1).trimStart();
            }
        }

        return { type, args, attributes: rest };
    }

    static findMatchingParen(value, startIndex) {
        let depth = 0;
        let inString = false;
        let stringChar = '';

        for (let i = startIndex; i < value.length; i++) {
            const char = value[i];

            if ((char === "'" || char === '"') && (i === 0 || value[i - 1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            if (inString) continue;

            if (char === '(') depth++;
            if (char === ')') {
                depth--;
                if (depth === 0) return i;
            }
        }

        return -1;
    }

    static extractDefaultValue(attributes) {
        // Avoid mis-parsing the DEFAULT keyword inside GENERATED ... AS IDENTITY clauses
        const identityMatch = attributes.match(/GENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY/i);
        let searchBuffer = attributes;
        if (identityMatch) {
            // Mask the identity clause to prevent DEFAULT detection inside it
            searchBuffer = attributes.replace(identityMatch[0], ' '.repeat(identityMatch[0].length));
        }

        const defaultIndex = searchBuffer.search(/\bDEFAULT\b/i);
        if (defaultIndex === -1) return { found: false, value: null };

        let value = attributes.slice(defaultIndex).replace(/^DEFAULT\s+/i, '').trim();
        // Remove trailing attributes
        value = value.replace(/\s+(?:ON\s+UPDATE|COMMENT|COLLATE|CHARACTER\s+SET|GENERATED|VIRTUAL|STORED|CHECK|INVISIBLE|LOCK|INSTANT)\b[\s\S]*$/i, '').trim();
        
        return { found: true, value: this.parseValue(this.normalizeSQLExpression(value)) };
    }

    static normalizeSQLExpression(value) {
        return value.replace(/\(\)$/g, '').trim();
    }

    static parseInsert(statement) {
        // Enhanced regex to handle all types of quoted identifiers
        const tableMatch = statement.match(/INSERT\s+INTO\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s(]+))/i);
        if (!tableMatch) return {};

        // Use the first matched group that contains the table name
        const tableName = this.normalizeIdentifier(tableMatch[1] || tableMatch[2] || tableMatch[3] || tableMatch[4]);

        // Enhanced column names extraction
        const columnMatch = statement.match(/\(([^)]+)\)\s*VALUES/i);
        const columns = columnMatch ?
            this.extractColumnNames(columnMatch[1]) : [];

        // Extract all VALUES sets
        const data = [];
        const valuesIdx = statement.toUpperCase().indexOf('VALUES');
        if (valuesIdx === -1) return { tableName, insertColumns: columns, data };
        
        const valuesContent = statement.substring(valuesIdx + 6);

        // Split the values content into individual value sets
        let inString = false;
        let stringChar = '';
        let parenthesesDepth = 0;
        let setStartIdx = -1;

        const len = valuesContent.length;
        for (let i = 0; i < len; i++) {
            const char = valuesContent[i];

            // Handle quotes — simpler check for common cases
            if (char === "'" || char === '"') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    // Check for escaped quote
                    let backslashCount = 0;
                    for (let j = i - 1; j >= 0 && valuesContent[j] === '\\'; j--) {
                        backslashCount++;
                    }
                    if (backslashCount % 2 === 0) {
                        inString = false;
                    }
                }
            }

            // Track parentheses depth
            if (!inString) {
                if (char === '(') {
                    if (parenthesesDepth === 0) setStartIdx = i;
                    parenthesesDepth++;
                }
                else if (char === ')') {
                    parenthesesDepth--;
                    if (parenthesesDepth === 0 && setStartIdx !== -1) {
                        const valueSet = valuesContent.substring(setStartIdx + 1, i);
                        data.push(this.parseSQLValueList(valueSet));
                        setStartIdx = -1;
                    }
                }
            }
        }

        return { tableName, insertColumns: columns, data };
    }

    static extractColumnNames(columnsStr) {
        const colPattern = /`([^`]+)`|([a-zA-Z0-9_]+)/g;
        const columns = [];
        let match;

        while ((match = colPattern.exec(columnsStr)) !== null) {
            columns.push(match[1] || match[2]);
        }

        return columns;
    }

    static parseSQLValueList(valueListStr) {
        const values = [];
        let inString = false;
        let stringChar = '';
        let parenthesesDepth = 0;
        let valStartIdx = 0;

        const len = valueListStr.length;
        for (let i = 0; i < len; i++) {
            const char = valueListStr[i];

            // Handle quotes
            if (char === "'" || char === '"') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    // Check for escaped quote
                    let backslashCount = 0;
                    for (let j = i - 1; j >= 0 && valueListStr[j] === '\\'; j--) {
                        backslashCount++;
                    }
                    if (backslashCount % 2 === 0) {
                        inString = false;
                    }
                }
            }

            // Track parentheses depth when not in a string
            if (!inString) {
                if (char === '(') parenthesesDepth++;
                else if (char === ')') parenthesesDepth--;
            }

            // Only split on comma if we're not in a string and not inside parentheses
            if (char === ',' && !inString && parenthesesDepth === 0) {
                values.push(this.parseValue(valueListStr.substring(valStartIdx, i).trim()));
                valStartIdx = i + 1;
            }
        }

        // Add the last value
        if (valStartIdx < len) {
            values.push(this.parseValue(valueListStr.substring(valStartIdx).trim()));
        }

        return values;
    }

    static splitColumnDefinitions(columnsString) {
        const definitions = [];
        let current = '';
        let depth = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < columnsString.length; i++) {
            const char = columnsString[i];

            // Handle string literals
            if ((char === "'" || char === '"') && (i === 0 || columnsString[i - 1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            if (!inString) {
                if (char === '(') depth++;
                if (char === ')') depth--;
            }

            if (char === ',' && depth === 0 && !inString) {
                definitions.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            definitions.push(current.trim());
        }

        return definitions;
    }

    static parseValue(value) {
        if (value === 'NULL' || value === 'null') return null;

        // Remove surrounding quotes
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
            return value.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
        }

        // Parse numbers
        if (!isNaN(value)) {
            return Number(value);
        }

        return value;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SQLParser;
} else if (typeof window !== 'undefined') {
    // Make SQLParser available globally in browser environments
    window.SQLParser = SQLParser;
}
