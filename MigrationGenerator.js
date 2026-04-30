class MigrationGenerator {
    static generate(tableName, tableData, options = {}) {
        if (!tableData?.columns || Object.keys(tableData.columns).length === 0) {
            return null;
        }

        const version = options.laravelVersion || 13;
        const isModern = version >= 9;
        const hasVoid = version >= 10;

        const columns = this.generateColumns(tableData.columns, tableData.foreignKeys, tableData.indexes, options);
        const indexes = this.generateIndexes(tableData.indexes, tableData.foreignKeys, tableData.columns, true);
        
        const body = [columns, indexes].filter(Boolean).join("\n            ");
        const className = `Create${this.formatClassName(tableName)}Table`;
        const imports = this.generateImports();

        if (isModern) {
            return `<?php

${imports}

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up()${hasVoid ? ': void' : ''}
    {
        Schema::create('${this.escapePhpString(tableName)}', function (Blueprint $table) {
            ${body}
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down()${hasVoid ? ': void' : ''}
    {
        Schema::dropIfExists('${this.escapePhpString(tableName)}');
    }
};`;
        } else {
            return `<?php

${imports}

class ${className} extends Migration
{
    /**
     * Run the migrations.
     */
    public function up()
    {
        Schema::create('${this.escapePhpString(tableName)}', function (Blueprint $table) {
            ${body}
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down()
    {
        Schema::dropIfExists('${this.escapePhpString(tableName)}');
    }
}`;
        }
    }

    static generateImports() {
        return [
            'use Illuminate\\Database\\Migrations\\Migration;',
            'use Illuminate\\Database\\Schema\\Blueprint;',
            'use Illuminate\\Support\\Facades\\Schema;',
        ].join('\n');
    }

    static generateColumns(columns, foreignKeys = [], indexes = [], options = {}) {
        const version = Number(options.laravelVersion) || 13;
        const singleColumnFKs = new Map();
        const singleColumnUnique = new Set();
        const singleColumnIndex = new Set();
        const fullTextColumns = new Set();
        const spatialIndexColumns = new Set();
        const morphs = new Set();
        const nullableMorphs = new Set();

        // Parse foreign keys
        foreignKeys.forEach(fk => {
            const match = fk.match(/^(?:CONSTRAINT\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s*(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s(]+))\s*\(([^)]+)\)(?:\s+ON\s+DELETE\s+(.+?))?(?:\s+ON\s+UPDATE\s+(.+?))?$/i);
            if (match) {
                const constraintName = match[1] || match[2] || match[3] || match[4] || null;
                const columnNames = match[5].split(',').map(c => c.trim().replace(/[`"']/g, ''));
                if (columnNames.length === 1) {
                    const referencedTable = match[6] || match[7] || match[8] || match[9];
                    const referencedColumns = match[10].split(',').map(c => c.trim().replace(/[`"']/g, ''));
                    const onDelete = this.cleanForeignAction(match[11]);
                    const onUpdate = this.cleanForeignAction(match[12]);
                    
                    singleColumnFKs.set(columnNames[0], {
                        table: referencedTable,
                        column: referencedColumns[0],
                        onDelete,
                        onUpdate,
                        constraintName: constraintName
                    });
                }
            }
        });

        // Parse unique, regular, and fulltext indexes
        indexes.forEach(idx => {
            const upperIdx = idx.toUpperCase();
            if (upperIdx.includes('UNIQUE')) {
                const match = idx.match(/UNIQUE\s+(?:(?:KEY|INDEX)\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|(\w+))\s*\(([^)]+)\)/i);
                if (match) {
                    const columns = match[5].split(',').map(c => c.trim().replace(/[`"']/g, ''));
                    if (columns.length === 1) singleColumnUnique.add(columns[0]);
                }
            } else if (upperIdx.includes('FULLTEXT')) {
                const match = idx.match(/FULLTEXT\s+(?:(?:KEY|INDEX)\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|(\w+))\s*\(([^)]+)\)/i);
                if (match) {
                    const columns = match[5].split(',').map(c => c.trim().replace(/[`"']/g, ''));
                    if (columns.length === 1) fullTextColumns.add(columns[0]);
                }
            } else if (upperIdx.includes('SPATIAL')) {
                const match = idx.match(/SPATIAL\s+(?:(?:KEY|INDEX)\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|(\w+))\s*\(([^)]+)\)/i);
                if (match) {
                    const columns = match[5].split(',').map(c => c.trim().replace(/[`"']/g, ''));
                    if (columns.length === 1) spatialIndexColumns.add(columns[0]);
                }
            } else if ((upperIdx.includes('KEY') || upperIdx.includes('INDEX')) && !upperIdx.includes('PRIMARY') && !upperIdx.includes('FOREIGN')) {
                const match = idx.match(/(?:KEY|INDEX)\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|(\w+))\s*\(([^)]+)\)/i);
                if (match) {
                    const columns = match[5].split(',').map(c => c.trim().replace(/[`"']/g, ''));
                    if (columns.length === 1) singleColumnIndex.add(columns[0]);
                }
            }
        });

        // Detect single-column primary key
        const primaryKeyIndex = indexes.find(idx => idx.toUpperCase().includes('PRIMARY KEY'));
        let primaryKeyColumn = null;
        if (primaryKeyIndex) {
            const match = primaryKeyIndex.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
            if (match) {
                const pks = match[1].split(',').map(c => c.trim().replace(/[`"']/g, ''));
                if (pks.length === 1) primaryKeyColumn = pks[0];
            }
        }

        // Detect polymorphic columns
        const columnNames = Object.keys(columns);
        columnNames.forEach(name => {
            if (name.endsWith('_id')) {
                const base = name.slice(0, -3);
                if (columnNames.includes(`${base}_type`)) {
                    const idColumn = columns[name];
                    const typeColumn = columns[`${base}_type`];
                    if (idColumn.nullable && typeColumn.nullable) {
                        nullableMorphs.add(base);
                    } else if (!idColumn.nullable && !typeColumn.nullable) {
                        morphs.add(base);
                    }
                }
            }
        });

        // Detect timestamps and soft deletes
        const hasCreatedAt = columnNames.includes('created_at');
        const hasUpdatedAt = columnNames.includes('updated_at');
        const hasDeletedAt = columnNames.includes('deleted_at');

        const isTzTimestamp = (name) => {
            const col = columns[name];
            return col && (col.type?.toLowerCase().includes('tz') || col.type?.toLowerCase().includes('with time zone'));
        };

        let columnStatements = [];

        Object.entries(columns).forEach(([columnName, columnData]) => {
            // Skip if handled by morphs
            const morphBase = Array.from(morphs).find(base => columnName === `${base}_id` || columnName === `${base}_type`);
            const nullableMorphBase = Array.from(nullableMorphs).find(base => columnName === `${base}_id` || columnName === `${base}_type`);
            if (morphBase) {
                if (columnName.endsWith('_id')) {
                    const type = columns[`${morphBase}_id`].type.toLowerCase();
                    let morphType = 'morphs';
                    if (type === 'uuid') morphType = 'uuidMorphs';
                    else if (type === 'ulid') morphType = 'ulidMorphs';
                    
                    columnStatements.push(`$table->${morphType}('${this.escapePhpString(morphBase)}');`);
                }
                return;
            }
            if (nullableMorphBase) {
                if (columnName.endsWith('_id')) {
                    const type = columns[`${nullableMorphBase}_id`].type.toLowerCase();
                    let morphType = 'nullableMorphs';
                    if (type === 'uuid') morphType = 'nullableUuidMorphs';
                    else if (type === 'ulid') morphType = 'nullableUlidMorphs';
                    
                    columnStatements.push(`$table->${morphType}('${this.escapePhpString(nullableMorphBase)}');`);
                }
                return;
            }

            // Skip if standard timestamps/soft deletes
            if (columnName === 'created_at' || columnName === 'updated_at' || columnName === 'deleted_at') return;

            const fkInfo = singleColumnFKs.get(columnName);
            const isUnique = singleColumnUnique.has(columnName);
            const isIndex = singleColumnIndex.has(columnName);
            const isFullText = fullTextColumns.has(columnName);
            const isSpatialIndex = spatialIndexColumns.has(columnName);
            const isPrimary = columnName === primaryKeyColumn;

            columnStatements.push(this.generateColumn(columnName, columnData, fkInfo, isUnique, isIndex, isPrimary, isFullText, options, isSpatialIndex));
        });

        // Add standard timestamps
        if (hasCreatedAt && hasUpdatedAt) {
            if ((isTzTimestamp('created_at') || isTzTimestamp('updated_at')) && version >= 11) {
                columnStatements.push('$table->timestampsTz();');
            } else {
                columnStatements.push('$table->timestamps();');
            }
        } else {
            if (hasCreatedAt) {
                const helper = (isTzTimestamp('created_at') && version >= 11) ? 'timestampTz' : 'timestamp';
                columnStatements.push(`$table->${helper}('created_at')->nullable();`);
            }
            if (hasUpdatedAt) {
                const helper = (isTzTimestamp('updated_at') && version >= 11) ? 'timestampTz' : 'timestamp';
                columnStatements.push(`$table->${helper}('updated_at')->nullable();`);
            }
        }

        if (hasDeletedAt) {
            const helper = (isTzTimestamp('deleted_at') && version >= 11) ? 'softDeletesTz' : 'softDeletes';
            columnStatements.push(`$table->${helper}();`);
        }

        return columnStatements.filter(Boolean).join("\n            ");
    }

    static generateColumn(columnName, columnData, fkInfo = null, isUnique = false, isIndex = false, isPrimary = false, isFullText = false, options = {}, isSpatialIndex = false) {
        const version = Number(options.laravelVersion) || 13;
        const type = columnData.type.toLowerCase();
        const escapedColumn = this.escapePhpString(columnName);
        let columnCode = '';

        // Handle primary key with modern id() helper
        if (columnData.autoIncrement && columnName === 'id') {
            return `$table->id();`;
        }

        // Idiomatic promotion for UUID/ULID primary keys
        if (isPrimary && type === 'char') {
            if (columnData.length === 36) {
                return `$table->uuid('${escapedColumn}')->primary();`;
            }
            if (columnData.length === 26) {
                return `$table->ulid('${escapedColumn}')->primary();`;
            }
        }

        // Handle auto-increment columns that are not the primary key 'id'
        if (columnData.autoIncrement) {
            if (type === 'bigint') {
                return `$table->bigIncrements('${escapedColumn}');`;
            }
            return `$table->increments('${escapedColumn}');`;
        }

        let isForeignKeyCandidate = false;
        const lowerCol = escapedColumn.toLowerCase();
        if (!fkInfo && (lowerCol.endsWith('_id') || lowerCol.endsWith('_uuid') || lowerCol.endsWith('_ulid'))) {
            if (type === 'bigint' && columnData.unsigned) isForeignKeyCandidate = true;
            if (type === 'uuid' || type === 'ulid') isForeignKeyCandidate = true;
            if (type === 'char' && (columnData.length === 36 || columnData.length === 26)) isForeignKeyCandidate = true;
        }

        // Handle Foreign Keys (Modern Shorthand)
        if (fkInfo || isForeignKeyCandidate) {
            const isUuid = type === 'uuid' || (type === 'char' && columnData.length === 36);
            const isUlid = type === 'ulid' || (type === 'char' && columnData.length === 26);

            if (isUuid) {
                columnCode = `$table->foreignUuid('${escapedColumn}')`;
            } else if (isUlid) {
                columnCode = `$table->foreignUlid('${escapedColumn}')`;
            } else {
                columnCode = `$table->foreignId('${escapedColumn}')`;
            }

            if (columnData.nullable) columnCode += '->nullable()';
            if (isUnique) columnCode += '->unique()';
            if (isIndex && !isUnique) columnCode += '->index()';
            if (isFullText) columnCode += '->fullText()';
            if (isSpatialIndex) columnCode += '->spatialIndex()';

            // Handle Default Value and Comments (Must be before constrained)
            if (columnData.hasDefault || (columnData.default !== null && columnData.default !== undefined)) {
                columnCode = this.addColumnModifiers(columnCode, columnData, true);
            }
            
            if (fkInfo) {
                // constrained() logic - use simple form when following convention
                const tableWithoutS = fkInfo.table.replace(/s$/, '');
                const expectedColumnName = `${tableWithoutS}_id`;
                const followsConvention = (columnName === expectedColumnName && fkInfo.column === 'id');
                if (followsConvention) {
                    columnCode += '->constrained()';
                } else {
                    columnCode += `->constrained('${this.escapePhpString(fkInfo.table)}'${fkInfo.column !== 'id' ? `, '${this.escapePhpString(fkInfo.column)}'` : ''})`;
                }

                if (fkInfo.onDelete) {
                    const helper = this.getOnActionHelper(fkInfo.onDelete, 'Delete');
                    if (helper) columnCode += `->${helper}`;
                    else columnCode += `->onDelete('${this.escapePhpString(fkInfo.onDelete)}')`;
                }
                if (fkInfo.onUpdate) {
                    const helper = this.getOnActionHelper(fkInfo.onUpdate, 'Update');
                    if (helper) columnCode += `->${helper}`;
                    else columnCode += `->onUpdate('${this.escapePhpString(fkInfo.onUpdate)}')`;
                }            }

            // Apply remaining column modifiers after constrained() if needed
            if (!(columnData.hasDefault || (columnData.default !== null && columnData.default !== undefined))) {
                columnCode = this.addColumnModifiers(columnCode, columnData, false);
            }

            return columnCode + ';';
        }

        // Map SQL types to Laravel column types
        switch (type) {
            case 'int':
            case 'integer':
                columnCode = columnData.unsigned
                    ? `$table->unsignedInteger('${escapedColumn}')`
                    : `$table->integer('${escapedColumn}')`;
                break;
            case 'bigint':
                columnCode = columnData.unsigned
                    ? `$table->unsignedBigInteger('${escapedColumn}')`
                    : `$table->bigInteger('${escapedColumn}')`;
                break;
            case 'tinyint':
                if (columnData.length === 1) {
                    columnCode = `$table->boolean('${escapedColumn}')`;
                } else if (columnData.unsigned) {
                    columnCode = `$table->unsignedTinyInteger('${escapedColumn}')`;
                } else {
                    columnCode = `$table->tinyInteger('${escapedColumn}')`;
                }
                break;
            case 'smallint':
                columnCode = columnData.unsigned
                    ? `$table->unsignedSmallInteger('${escapedColumn}')`
                    : `$table->smallInteger('${escapedColumn}')`;
                break;
            case 'mediumint':
                columnCode = columnData.unsigned
                    ? `$table->unsignedMediumInteger('${escapedColumn}')`
                    : `$table->mediumInteger('${escapedColumn}')`;
                break;
            case 'decimal':
                const precision = Array.isArray(columnData.length) ? columnData.length[0] : 8;
                const scale = Array.isArray(columnData.length) ? columnData.length[1] : 2;
                columnCode = `$table->decimal('${escapedColumn}', ${precision}, ${scale})`;
                break;
            case 'float':
                columnCode = `$table->float('${escapedColumn}')`;
                break;
            case 'double':
            case 'double precision':
                columnCode = `$table->double('${escapedColumn}')`;
                break;
            case 'varchar':
            case 'character varying':
                if (columnName === 'ip_address' || columnName === 'ip') {
                    columnCode = `$table->ipAddress('${escapedColumn}')`;
                } else if (columnName === 'mac_address' || columnName === 'mac') {
                    columnCode = `$table->macAddress('${escapedColumn}')`;
                } else {
                    const length = columnData.length || 255;
                    columnCode = `$table->string('${escapedColumn}', ${length})`;
                }
                break;
            case 'char':
            case 'character':
                if (columnData.length === 26 && (columnName.toLowerCase().includes('ulid') || columnName.endsWith('_id'))) {
                    columnCode = `$table->ulid('${escapedColumn}')`;
                } else {
                    const charLength = columnData.length || 255;
                    columnCode = `$table->char('${escapedColumn}', ${charLength})`;
                }
                break;
            case 'tinytext':
                columnCode = `$table->tinyText('${escapedColumn}')`;
                break;
            case 'text':
                columnCode = `$table->text('${escapedColumn}')`;
                break;
            case 'mediumtext':
                columnCode = `$table->mediumText('${escapedColumn}')`;
                break;
            case 'longtext':
                columnCode = `$table->longText('${escapedColumn}')`;
                break;
            case 'json':
                columnCode = `$table->json('${escapedColumn}')`;
                break;
            case 'jsonb':
                columnCode = `$table->jsonb('${escapedColumn}')`;
                break;
            case 'date':
                columnCode = `$table->date('${escapedColumn}')`;
                break;
            case 'datetime':
                columnCode = `$table->dateTime('${escapedColumn}')`;
                break;
            case 'datetimetz':
                columnCode = `$table->dateTimeTz('${escapedColumn}')`;
                break;
            case 'timestamp':
                columnCode = `$table->timestamp('${escapedColumn}')`;
                break;
            case 'timestamptz':
                columnCode = `$table->timestampTz('${escapedColumn}')`;
                break;
            case 'timetz':
                columnCode = `$table->timeTz('${escapedColumn}')`;
                break;
            case 'time':
                columnCode = `$table->time('${escapedColumn}')`;
                break;
            case 'year':
                columnCode = `$table->year('${escapedColumn}')`;
                break;
            case 'enum':
                const enumValues = columnData.values || [];
                const formattedValues = Array.isArray(enumValues)
                    ? enumValues.map(val => `'${this.escapePhpString(String(val))}'`).join(', ')
                    : '';
                columnCode = `$table->enum('${escapedColumn}', [${formattedValues}])`;
                break;
            case 'set':
                const setValues = columnData.values || [];
                const formattedSetValues = Array.isArray(setValues)
                    ? setValues.map(val => `'${this.escapePhpString(String(val))}'`).join(', ')
                    : '';
                columnCode = `$table->set('${escapedColumn}', [${formattedSetValues}])`;
                break;
            case 'boolean':
            case 'bool':
                columnCode = `$table->boolean('${escapedColumn}')`;
                break;
            case 'uuid':
                columnCode = `$table->uuid('${escapedColumn}')`;
                if (isPrimary) columnCode += '->primary()';
                break;
            case 'ulid':
                columnCode = `$table->ulid('${escapedColumn}')`;
                if (isPrimary) columnCode += '->primary()';
                break;
            case 'longblob':
            case 'mediumblob':
            case 'tinyblob':
            case 'binary':
            case 'blob':
                columnCode = `$table->binary('${escapedColumn}')`;
                break;
            case 'ipaddress':
            case 'inet':
                columnCode = `$table->ipAddress('${escapedColumn}')`;
                break;
            case 'macaddr':
            case 'macaddress':
                columnCode = `$table->macAddress('${escapedColumn}')`;
                break;
            case 'geometry':
            case 'geography':
            case 'point':
            case 'linestring':
            case 'polygon':
            case 'geometrycollection':
            case 'multipoint':
            case 'multilinestring':
            case 'multipolygon':
                const spatialMethod = type === 'linestring' ? 'lineString' : 
                                    type === 'geometrycollection' ? 'geometryCollection' :
                                    type === 'multipoint' ? 'multiPoint' :
                                    type === 'multilinestring' ? 'multiLineString' :
                                    type === 'multipolygon' ? 'multiPolygon' : type;
                if (type === 'geography' && version < 11) {
                    columnCode = `$table->geometry('${escapedColumn}')`;
                } else {
                    columnCode = `$table->${spatialMethod}('${escapedColumn}')`;
                }
                break;
            case 'tsvector':
                columnCode = version >= 12
                    ? `$table->tsvector('${escapedColumn}')`
                    : `$table->text('${escapedColumn}')`;
                break;
            case 'vector':
                const dimensions = columnData.length || 3;
                if (version >= 11) {
                    columnCode = `$table->vector('${escapedColumn}', ${dimensions})`;
                } else {
                    columnCode = `$table->text('${escapedColumn}')`;
                }
                break;            default:
                if (columnName === 'remember_token' && (type === 'varchar' || type === 'string')) {
                    return `$table->rememberToken();`;
                }
                if (columnName === 'ip_address' || columnName === 'ip') {
                    columnCode = `$table->ipAddress('${escapedColumn}')`;
                } else if (columnName === 'mac_address' || columnName === 'mac') {
                    columnCode = `$table->macAddress('${escapedColumn}')`;
                } else {
                    columnCode = `$table->string('${escapedColumn}')`;
                }
        }

        // Add modifiers
        if (columnData.unsigned && !/^.*unsigned.*Integer/.test(columnCode) && !columnData.autoIncrement) {
            columnCode += '->unsigned()';
        }

        if (columnData.nullable) {
            columnCode += '->nullable()';
        }

        if (isUnique) {
            columnCode += '->unique()';
        } else if (isIndex) {
            columnCode += '->index()';
        } else if (isFullText) {
            columnCode += '->fullText()';
        } else if (isSpatialIndex) {
            columnCode += '->spatialIndex()';
        }

        if (isPrimary && !columnCode.includes('->primary()') && !columnCode.includes('$table->id')) {
            columnCode += '->primary()';
        }

        if (columnData.generatedAs) {
            columnCode += `->generatedAs()`;
            if (columnData.generatedAs === 'always') {
                columnCode += `->always()`;
            }
        }

        columnCode = this.addColumnModifiers(columnCode, columnData);

        return columnCode + ';';
    }

    static addColumnModifiers(columnCode, columnData, isFk) {
        const type = columnData.type?.toLowerCase();

        if (columnData.hasDefault || (columnData.default !== null && columnData.default !== undefined)) {
            let defaultValue = columnData.default;

            if (typeof defaultValue === 'string') {
                if (defaultValue.toUpperCase() === 'CURRENT_TIMESTAMP') {
                    columnCode += '->useCurrent()';
                } else if (defaultValue.toUpperCase() === 'NULL' || defaultValue.toLowerCase() === 'null') {
                    // Skip default(null) for nullable columns (redundant)
                    if (!columnData.nullable) {
                        columnCode += '->default(null)';
                    }
                } else if ((defaultValue.toLowerCase() === 'true' || defaultValue.toLowerCase() === 'false' || defaultValue === '1' || defaultValue === '0') && 
                           (type === 'boolean' || type === 'bool' || (type === 'tinyint' && columnData.length === 1))) {
                    // Handle boolean string values for boolean columns
                    const boolVal = (defaultValue.toLowerCase() === 'true' || defaultValue === '1') ? 'true' : 'false';
                    columnCode += `->default(${boolVal})`;
                } else {
                    columnCode += `->default('${this.escapePhpString(defaultValue)}')`;
                }
            } else if (defaultValue === null) {
                // Skip default(null) for nullable columns (redundant)
                if (!columnData.nullable) {
                    columnCode += '->default(null)';
                }
            } else if (typeof defaultValue === 'number') {
                if (type === 'boolean' || type === 'bool' || (type === 'tinyint' && columnData.length === 1)) {
                    columnCode += `->default(${defaultValue === 1 ? 'true' : 'false'})`;
                } else {
                    columnCode += `->default(${defaultValue})`;
                }
            } else if (typeof defaultValue === 'boolean') {
                columnCode += `->default(${defaultValue ? 'true' : 'false'})`;
            }
        }

        if (columnData.onUpdate && columnData.onUpdate.toUpperCase() === 'CURRENT_TIMESTAMP') {
            columnCode += '->useCurrentOnUpdate()';
        }

        if (columnData.comment) {
            columnCode += `->comment('${this.escapePhpString(columnData.comment)}')`;
        }

        // Modern Laravel 10+ column modifiers
        if (columnData.virtualAs) {
            columnCode += `->virtualAs('${this.escapePhpString(columnData.virtualAs)}')`;
        }
        if (columnData.storedAs) {
            columnCode += `->storedAs('${this.escapePhpString(columnData.storedAs)}')`;
        }
        if (columnData.invisible) {
            columnCode += '->invisible()';
        }
        if (columnData.lock) {
            columnCode += `->lock('${this.escapePhpString(columnData.lock)}')`;
        }
        if (columnData.instant) {
            columnCode += '->instant()';
        }

        return columnCode;
    }

    static generateIndexes(indexes = [], foreignKeys = [], columns = {}, modern = false) {
        if ((!indexes || indexes.length === 0) && (!foreignKeys || foreignKeys.length === 0)) {
            return '';
        }

        const indexStatements = [];
        const autoIncrementColumns = new Set(Object.entries(columns)
            .filter(([, column]) => column.autoIncrement)
            .map(([name]) => name));

        // Process primary keys
        const primaryKeyIndex = indexes.find(idx => idx.toUpperCase().includes('PRIMARY KEY'));
        if (primaryKeyIndex) {
            const match = primaryKeyIndex.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
            if (match) {
                const pkColumns = match[1].split(',')
                    .map(col => col.trim().replace(/^`|`$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, ''));

                if (pkColumns.length === 1) {
                    const colName = pkColumns[0];
                    const colData = columns[colName];
                    const isIdCandidate = colData && (colData.autoIncrement || colData.type.toLowerCase() === 'bigint' || colData.type.toLowerCase() === 'int' || colData.type.toLowerCase() === 'integer');
                    
                    if (modern && isIdCandidate) {
                        // Already handled by $table->id()
                    } else if (!modern || pkColumns.length > 1) {
                        if (pkColumns.length === 1) {
                            indexStatements.push(`$table->primary('${this.escapePhpString(pkColumns[0])}');`);
                        } else {
                            const columnList = pkColumns.map(col => `'${this.escapePhpString(col)}'`).join(', ');
                            indexStatements.push(`$table->primary([${columnList}]);`);
                        }
                    }
                } else {
                    const columnList = pkColumns.map(col => `'${this.escapePhpString(col)}'`).join(', ');
                    indexStatements.push(`$table->primary([${columnList}]);`);
                }
            }
        }

        // Process unique keys
        indexes.filter(idx => idx.toUpperCase().includes('UNIQUE'))
            .forEach(idx => {
                const match = idx.match(/UNIQUE\s+(?:(?:KEY|INDEX)\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|(\w+))\s*\(([^)]+)\)/i);
                if (match) {
                    const indexName = match[1] || match[2] || match[3] || match[4];
                    const idxColumns = match[5].split(',')
                        .map(col => col.trim().replace(/^`|`$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, ''));

                    if (modern && idxColumns.length === 1) {
                        // Already handled inline
                    } else {
                        if (idxColumns.length === 1) {
                            indexStatements.push(`$table->unique('${this.escapePhpString(idxColumns[0])}', '${this.escapePhpString(indexName)}');`);
                        } else {
                            const columnList = idxColumns.map(col => `'${this.escapePhpString(col)}'`).join(', ');
                            indexStatements.push(`$table->unique([${columnList}], '${this.escapePhpString(indexName)}');`);
                        }
                    }
                }
            });

        // Process fulltext keys
        indexes.filter(idx => idx.toUpperCase().includes('FULLTEXT'))
            .forEach(idx => {
                const match = idx.match(/FULLTEXT\s+(?:(?:KEY|INDEX)\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|(\w+))\s*\(([^)]+)\)/i);
                if (match) {
                    const indexName = match[1] || match[2] || match[3] || match[4];
                    const idxColumns = match[5].split(',')
                        .map(col => col.trim().replace(/^`|`$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, ''));

                    if (modern && idxColumns.length === 1) {
                        // Already handled inline
                    } else {
                        const columnList = idxColumns.length === 1 ? `'${this.escapePhpString(idxColumns[0])}'` : `[${idxColumns.map(c => `'${this.escapePhpString(c)}'`).join(', ')}]`;
                        indexStatements.push(`$table->fullText(${columnList}, '${this.escapePhpString(indexName)}');`);
                    }
                }
            });

        // Process spatial indexes
        indexes.filter(idx => idx.toUpperCase().includes('SPATIAL'))
            .forEach(idx => {
                const match = idx.match(/SPATIAL\s+(?:(?:KEY|INDEX)\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|(\w+))\s*\(([^)]+)\)/i);
                if (match) {
                    const indexName = match[1] || match[2] || match[3] || match[4];
                    const idxColumns = match[5].split(',')
                        .map(col => col.trim().replace(/^`|`$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, ''));

                    if (modern && idxColumns.length === 1) {
                        // Already handled inline
                    } else {
                        const columnList = idxColumns.length === 1 ? `'${this.escapePhpString(idxColumns[0])}'` : `[${idxColumns.map(c => `'${this.escapePhpString(c)}'`).join(', ')}]`;
                        indexStatements.push(`$table->spatialIndex(${columnList}, '${this.escapePhpString(indexName)}');`);
                    }
                }
            });

        // Process regular indexes
        indexes.filter(idx => (idx.toUpperCase().includes('KEY') || idx.toUpperCase().includes('INDEX')) &&
                             !idx.toUpperCase().includes('PRIMARY KEY') &&
                             !idx.toUpperCase().includes('UNIQUE') &&
                             !idx.toUpperCase().includes('FULLTEXT') &&
                             !idx.toUpperCase().includes('SPATIAL') &&
                             !idx.toUpperCase().includes('FOREIGN KEY'))
            .forEach(idx => {
                const match = idx.match(/(?:KEY|INDEX)\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|(\w+))\s*\(([^)]+)\)/i);
                if (match) {
                    const indexName = match[1] || match[2] || match[3] || match[4];
                    const idxColumns = match[5].split(',')
                        .map(col => col.trim().replace(/^`|`$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, ''));

                    if (modern && idxColumns.length === 1) {
                        // Already handled inline
                    } else {
                        if (idxColumns.length === 1) {
                            indexStatements.push(`$table->index('${this.escapePhpString(idxColumns[0])}', '${this.escapePhpString(indexName)}');`);
                        } else {
                            const columnList = idxColumns.map(col => `'${this.escapePhpString(col)}'`).join(', ');
                            indexStatements.push(`$table->index([${columnList}], '${this.escapePhpString(indexName)}');`);
                        }
                    }
                }
            });

        // Process foreign keys (only those not handled by modern shorthand)
        if (foreignKeys && foreignKeys.length > 0) {
            foreignKeys.forEach(fk => {
                const match = fk.match(/^(?:CONSTRAINT\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s*(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s(]+))\s*\(([^)]+)\)(?:\s+ON\s+DELETE\s+(.+?))?(?:\s+ON\s+UPDATE\s+(.+?))?$/i);
                if (match) {
                    const constraintName = match[1] || match[2] || match[3] || match[4] || null;
                    const fkColumns = match[5].split(',')
                        .map(col => col.trim().replace(/^`|`$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
                    const referencedTable = match[6] || match[7] || match[8] || match[9];
                    const referencedColumns = match[10].split(',')
                        .map(col => col.trim().replace(/^`|`$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
                    const onDelete = this.cleanForeignAction(match[11]);
                    const onUpdate = this.cleanForeignAction(match[12]);

                    if (modern && fkColumns.length === 1) {
                        // Already handled by foreignId()
                    } else {
                        let fkStatement = `$table->foreign(${fkColumns.length === 1 ? `'${this.escapePhpString(fkColumns[0])}'` : `[${fkColumns.map(c => `'${this.escapePhpString(c)}'`).join(', ')}]`}${constraintName ? `, '${this.escapePhpString(constraintName)}'` : ''})` +
                                        `->references(${referencedColumns.length === 1 ? `'${this.escapePhpString(referencedColumns[0])}'` : `[${referencedColumns.map(c => `'${this.escapePhpString(c)}'`).join(', ')}]`})` +
                                        `->on('${this.escapePhpString(referencedTable)}')`;

                        if (onDelete) {
                            const helper = this.getOnActionHelper(onDelete, 'Delete');
                            if (helper) fkStatement += `->${helper}`;
                            else fkStatement += `->onDelete('${this.escapePhpString(onDelete.toLowerCase())}')`;
                        }

                        if (onUpdate) {
                            const helper = this.getOnActionHelper(onUpdate, 'Update');
                            if (helper) fkStatement += `->${helper}`;
                            else fkStatement += `->onUpdate('${this.escapePhpString(onUpdate.toLowerCase())}')`;
                        }

                        indexStatements.push(fkStatement + ';');
                    }
                }
            });
        }

        return indexStatements.filter(Boolean).join("\n            ");
    }

    static getForeignKeyColumns(foreignKeys = []) {
        return foreignKeys.map(fk => {
            const match = fk.match(/FOREIGN\s+KEY\s*\(([^)]+)\)/i);
            return {
                columns: match ? match[1].split(',').map(col => col.trim().replace(/^`|`$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, '')) : []
            };
        });
    }

    static getOnActionHelper(action, type) {
        if (!action) return null;
        const normalizedAction = action.toLowerCase().trim();
        const actionMap = {
            'cascade': `cascadeOn${type}()`,
            'set null': `nullOn${type}()`,
            'restrict': `restrictOn${type}()`,
            'no action': `noActionOn${type}()`
        };
        return actionMap[normalizedAction] || null;
    }

    static cleanForeignAction(action) {
        if (!action) return null;
        return action
            .replace(/\s+ON\s+(?:DELETE|UPDATE)[\s\S]*$/i, '')
            .trim()
            .toLowerCase();
    }

    static escapePhpString(value) {
        return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    static formatClassName(tableName) {
        const className = String(tableName)
            .split(/[^a-zA-Z0-9]+/)
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');

        return /^\d/.test(className) ? `Table${className}` : (className || 'Generated');
    }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MigrationGenerator;
} else if (typeof window !== 'undefined') {
    // Make MigrationGenerator available globally in browser environments
    window.MigrationGenerator = MigrationGenerator;
}
