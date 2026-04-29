class SQLParser {
    static parseSQLContent(sqlContent) {
        const tables = {};
        const statements = this.splitIntoStatements(sqlContent);

        statements.forEach(stmt => {
            const trimmedStmt = stmt.trim();

            if (trimmedStmt.toUpperCase().startsWith('CREATE TABLE')) {
                const { tableName, structure } = this.parseCreateTable(trimmedStmt);
                if (tableName) {
                    tables[tableName] = structure || {
                        columns: {},
                        indexes: [],
                        data: []
                    };
                }
            } else if (trimmedStmt.toUpperCase().startsWith('INSERT INTO')) {
                const { tableName, insertColumns, data } = this.parseInsert(trimmedStmt);
                if (tableName) {
                    // Create table entry if it doesn't exist
                    if (!tables[tableName]) {
                        tables[tableName] = {
                            columns: {},
                            indexes: [],
                            data: [],
                            insertColumns: [],
                            insertRows: []
                        };
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
            }
        });

        return { tables };
    }

    static splitIntoStatements(sqlContent) {
        // Remove comments and normalize whitespace
        sqlContent = sqlContent
            .replace(/--.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/#.*$/gm, '')
            .trim();

        const statements = [];
        let currentStatement = '';
        let inString = false;
        let stringChar = '';
        let parenDepth = 0;

        for (let i = 0; i < sqlContent.length; i++) {
            const char = sqlContent[i];

            // Handle string literals
            if ((char === "'" || char === '"') && (i === 0 || sqlContent[i - 1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            if (!inString) {
                if (char === '(') parenDepth++;
                else if (char === ')') parenDepth--;
            }

            currentStatement += char;

            // If we encounter a semicolon outside of a string and at depth 0
            if (char === ';' && !inString && parenDepth === 0) {
                const trimmedStatement = currentStatement.trim();
                if (trimmedStatement && trimmedStatement !== ';') {
                    statements.push(trimmedStatement);
                }
                currentStatement = '';
            }
            // Heuristic for missing semicolons: if we see CREATE TABLE or INSERT INTO at depth 0 
            // and the current buffer has significant content, it might be a new statement.
            else if (!inString && parenDepth === 0 && i < sqlContent.length - 15) {
                const nextPart = sqlContent.slice(i + 1).trimStart().toUpperCase();
                if (nextPart.startsWith('CREATE TABLE') || nextPart.startsWith('INSERT INTO')) {
                    const trimmedStatement = currentStatement.trim();
                    if (trimmedStatement) {
                        statements.push(trimmedStatement);
                        currentStatement = '';
                    }
                }
            }
        }

        // Add the last statement if it exists
        const trimmedStatement = currentStatement.trim();
        if (trimmedStatement && trimmedStatement !== ';') {
            statements.push(trimmedStatement);
        }

        return statements.filter(stmt => stmt.trim().length > 0);
    }

    static parseCreateTable(statement) {
        // Enhanced regex to handle quoted identifiers and backticks
        const tableMatch = statement.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s(]+))\s*\(([\s\S]+)\)/i);
        if (!tableMatch) return {};

        const tableName = tableMatch[1] || tableMatch[2] || tableMatch[3] || tableMatch[4];
        let columnsString = tableMatch[5];
        
        // Remove trailing engine/charset info if it's still there after the last paren
        // (The regex above might include it if there's no closing paren or something, but usually it stops at the last paren)
        // Actually our regex is greedy ([\s\S]+). We need to find the matching closing paren for the table.
        const firstParenIndex = statement.indexOf('(');
        const lastParenIndex = this.findMatchingParen(statement, firstParenIndex);
        if (lastParenIndex !== -1) {
            columnsString = statement.slice(firstParenIndex + 1, lastParenIndex);
        }

        const structure = {
            columns: {},
            indexes: [],
            foreignKeys: [],
            checkConstraints: [],
            data: []
        };

        // Split column definitions and process
        this.splitColumnDefinitions(columnsString).forEach(def => {
            const trimmedDef = def.trim();

            // Handle foreign key constraints
            if (/^(?:CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|'[^']+'|[^\s]+)\s+)?FOREIGN\s+KEY/i.test(trimmedDef)) {
                structure.foreignKeys.push(trimmedDef);
                structure.indexes.push(trimmedDef);
                return;
            }

            // Handle indexes and constraints
            if (/^(PRIMARY KEY|KEY|UNIQUE(?:\s+KEY)?|UNIQUE(?:\s+INDEX)?|INDEX|FULLTEXT(?:\s+KEY|\s+INDEX)?|SPATIAL(?:\s+KEY|\s+INDEX)?)/i.test(trimmedDef)) {
                structure.indexes.push(trimmedDef);
                return;
            }
            
            // Handle CHECK constraints
            if (/^(?:CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|'[^']+'|[^\s]+)\s+)?CHECK/i.test(trimmedDef)) {
                structure.checkConstraints.push(trimmedDef);
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
            generatedAs: null,
            always: false,
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

        const generatedMatch = attributes.match(/\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+/i);
        if (generatedMatch) {
            typeInfo.generatedAs = generatedMatch[1].replace(/\s+/g, '').toLowerCase();
            const afterAs = attributes.slice(generatedMatch.index + generatedMatch[0].length).trimStart();
            if (afterAs.startsWith('(')) {
                const closeIdx = this.findMatchingParen(afterAs, 0);
                if (closeIdx !== -1) {
                    const expr = afterAs.slice(1, closeIdx);
                    if (/\bSTORED\b/i.test(attributes)) typeInfo.storedAs = expr;
                    else typeInfo.virtualAs = expr;
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

        const lockMatch = attributes.match(/\bLOCK\s+(NONE|SHARE|UPDATE)\b/i);
        if (lockMatch) {
            typeInfo.lock = lockMatch[1].toLowerCase();
        }

        if (/\bINSTANT\b/i.test(attributes)) {
            typeInfo.instant = true;
        }

        return typeInfo;
    }

    static extractTypeAndAttributes(definition) {
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

        const pgTypes = [
            'timestamp without time zone',
            'timestamp with time zone',
            'time without time zone',
            'time with time zone',
            'timestamp',
            'timestamptz',
            'timetz',
            'serial',
            'bigserial',
            'smallserial',
            'money',
            'bit varying',
            'character varying',
            'national character',
            'geography',
            'tsvector'
        ];
        
        for (const pgType of pgTypes) {
            if (definition.toLowerCase().startsWith(pgType)) {
                type = pgType.replace(/\s+/g, '').replace(/without/gi, '').replace(/with/gi, '');
                if (pgType.includes('time zone')) {
                    type = type.replace(/timezone/gi, 'tz').replace(/time/gi, '').replace(/zone/gi, '');
                    if (pgType.includes('timestamp')) type = 'timestamptz';
                    else type = 'timetz';
                }
                consumed = pgType.length;
                break;
            }
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
        const defaultIndex = attributes.search(/\bDEFAULT\b/i);
        if (defaultIndex === -1) return { found: false, value: null };

        let value = attributes.slice(defaultIndex).replace(/^DEFAULT\s+/i, '').trim();
        value = value.replace(/\s+(?:ON\s+UPDATE|COMMENT|COLLATE|CHARACTER\s+SET)\b[\s\S]*$/i, '').trim();
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
        const tableName = tableMatch[1] || tableMatch[2] || tableMatch[3] || tableMatch[4];

        // Enhanced column names extraction
        const columnMatch = statement.match(/\(([^)]+)\)\s*VALUES/i);
        const columns = columnMatch ?
            this.extractColumnNames(columnMatch[1]) : [];

        // Extract all VALUES sets
        const data = [];
        let valuesContent = statement.substring(statement.toUpperCase().indexOf('VALUES') + 'VALUES'.length);

        // Split the values content into individual value sets
        let currentSet = '';
        let inString = false;
        let stringChar = '';
        let parenthesesDepth = 0;

        for (let i = 0; i < valuesContent.length; i++) {
            const char = valuesContent[i];

            // Handle quotes
            if ((char === "'" || char === '"') && (i === 0 || valuesContent[i-1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            // Track parentheses depth
            if (!inString) {
                if (char === '(') parenthesesDepth++;
                if (char === ')') {
                    parenthesesDepth--;
                    if (parenthesesDepth === 0) {
                        currentSet += char;
                        // Extract content between parentheses
                        const valueSet = currentSet.match(/\(([^]*)\)/);
                        if (valueSet) {
                            data.push(this.parseSQLValueList(valueSet[1]));
                        }
                        currentSet = '';
                        continue;
                    }
                }
            }

            currentSet += char;
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
        let currentValue = '';
        let inString = false;
        let stringChar = '';
        let parenthesesDepth = 0;

        for (let i = 0; i < valueListStr.length; i++) {
            const char = valueListStr[i];

            // Handle quotes
            if ((char === "'" || char === '"') && (i === 0 || valueListStr[i-1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            // Track parentheses depth when not in a string
            if (!inString) {
                if (char === '(') parenthesesDepth++;
                if (char === ')') parenthesesDepth--;
            }

            // Only split on comma if we're not in a string and not inside parentheses
            if (char === ',' && !inString && parenthesesDepth === 0) {
                values.push(this.parseValue(currentValue.trim()));
                currentValue = '';
            } else {
                currentValue += char;
            }
        }

        // Add the last value if any
        if (currentValue.trim()) {
            values.push(this.parseValue(currentValue.trim()));
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
