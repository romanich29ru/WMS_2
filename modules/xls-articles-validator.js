/**
 * Enhanced XLS Articles Validator
 * Парсит и валидирует XLS файлы с поддержкой:
 * - Множественных артикулов в одной ячейке (ОШИБКА)
 * - Проверки статуса занято/пусто
 * - Визуализации ошибок в интерфейсе
 */

class XLSArticlesValidator {
    /**
     * Парсить и валидировать XLS данные
     * Возвращает подробный отчет с ошибками
     */
    static parseAndValidate(xlsData) {
        const results = {
            cellsData: {},           // Данные по ячейкам
            errors: [],              // Список ошибок
            warnings: [],            // Предупреждения
            multipleArticlesErrors: [], // НОВОЕ: Ошибки множественных артикулов
            statistics: {
                totalRows: 0,
                cellsProcessed: 0,
                cellsOk: 0,
                cellsWithErrors: 0,
                cellsWithMultipleArticles: 0,
                occupiedCells: 0,
                emptyCells: 0
            }
        };

        if (!xlsData || !Array.isArray(xlsData)) {
            results.errors.push('Некорректный формат XLS данных');
            return results;
        }

        results.statistics.totalRows = xlsData.length;

        for (let rowIndex = 0; rowIndex < xlsData.length; rowIndex++) {
            const row = xlsData[rowIndex];
            if (!row || typeof row !== 'object') continue;

            // Получить значения из строки (поддержка разных форматов)
            const cellName = this.getCellValue(row, ['Название Ячейки', 'Cell Name', 'Ячейка', 'A']);
            const status = this.getCellValue(row, ['Статус', 'Status', 'Статус ячейки', 'B']);
            const articlesStr = this.getCellValue(row, ['Артикул', 'SKU', 'Артикулы', 'C']);
            const countStr = this.getCellValue(row, ['Кол-во', 'Quantity', 'Кол-во артикулов', 'D']);
            const description = this.getCellValue(row, ['Описание', 'Description', 'Примечание', 'E']);

            // Пропустить пустые строки
            if (!cellName || !cellName.toString().trim()) continue;

            // Нормализовать имя ячейки
            const cellId = this.normalizeCellName(cellName.toString());
            if (!cellId) {
                results.errors.push({
                    row: rowIndex + 1,
                    cellName: cellName,
                    error: 'Неверный формат названия ячейки. Ожидается: A01-01-01-A'
                });
                continue;
            }

            results.statistics.cellsProcessed++;

            // Нормализовать статус
            const normalizedStatus = this.normalizeStatus(status);
            if (normalizedStatus === 'unknown') {
                results.warnings.push({
                    cellId: cellId,
                    warning: `Неясный статус: "${status}". Установлено как "empty"`
                });
            }

            // ГЛАВНОЕ: Парсить артикулы и проверить на ошибки множественности
            const articles = this.parseArticles(articlesStr, countStr);
            
            // ОШИБКА: Если несколько артикулов в одной ячейке
            if (articles.length > 1) {
                results.statistics.cellsWithMultipleArticles++;
                results.statistics.cellsWithErrors++;

                const errorInfo = {
                    cellId: cellId,
                    severity: 'ERROR',
                    type: 'MULTIPLE_ARTICLES',
                    articlesCount: articles.length,
                    articles: articles,
                    articlesError: `⚠️ ОШИБКА: В ячейке ${articles.length} разных артикулов вместо 1`,
                    message: `Ячейка ${cellId} содержит ${articles.length} артикулов: ${articles.map(a => a.sku).join(', ')}. Необходимо проверить!`
                };

                results.errors.push(errorInfo);
                results.multipleArticlesErrors.push(errorInfo);
            } else {
                results.statistics.cellsOk++;
            }

            // Подсчет занятых/пустых
            if (normalizedStatus === 'occupied') {
                results.statistics.occupiedCells++;
            } else {
                results.statistics.emptyCells++;
            }

            // Сохранить данные ячейки
            results.cellsData[cellId] = {
                cellId: cellId,
                systemStatus: normalizedStatus,
                expectedArticles: articles,
                articlesCount: articles.length,
                hasMultipleArticles: articles.length > 1,
                articlesError: articles.length > 1 ? 
                    `⚠️ ОШИБКА: В ячейке ${articles.length} артикулов вместо 1` : 
                    null,
                originalRow: {
                    cellName: cellName,
                    status: status,
                    articles: articlesStr,
                    count: countStr
                }
            };
        }

        return results;
    }

    /**
     * Получить значение из объекта строки по возможным ключам
     */
    static getCellValue(row, keys) {
        for (const key of keys) {
            if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                return row[key];
            }
        }
        return null;
    }

    /**
     * Нормализовать имя ячейки
     * Поддерживает форматы:
     * - A01-01-01-A
     * - A01 01 01 A
     * - A01010A
     * - OS A01-01-01-A
     */
    static normalizeCellName(name) {
        if (!name) return null;

        // Очистить и привести к верхнему регистру
        let cleaned = String(name)
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '-') // Заменить пробелы на дефисы
            .replace(/[^\w\-]/g, ''); // Убрать спецсимволы

        // Удалить префикс "OS" если есть
        cleaned = cleaned.replace(/^OS-?/, '');

        // Паттерны для разных форматов
        const patterns = [
            // A01-01-01-A
            /^(A\d{2})-(\d{2})-(\d{2})-([A-Z])$/,
            // A01 01 01 A → A01-01-01-A
            /^(A\d{2})-(\d{2})-(\d{2})-([A-Z])$/,
            // A01010A → A01-01-01-A (без разделителей)
            /^(A\d{2})(\d{2})(\d{2})([A-Z])$/,
        ];

        for (const pattern of patterns) {
            const match = cleaned.match(pattern);
            if (match) {
                return `${match[1]}-${match[2]}-${match[3]}-${match[4]}`;
            }
        }

        // Если не совпадает ни один паттерн
        return null;
    }

    /**
     * Нормализовать статус ячейки
     */
    static normalizeStatus(status) {
        if (!status) return 'empty';

        const statusStr = String(status).toLowerCase().trim();

        if (statusStr.includes('occu') || statusStr.includes('заня')) {
            return 'occupied';
        } else if (statusStr.includes('empt') || statusStr.includes('пусто') || statusStr.includes('пуст')) {
            return 'empty';
        }

        return 'unknown';
    }

    /**
     * Парсить строку артикулов
     * Поддерживает форматы:
     * - "SKU-001" → один артикул
     * - "SKU-001; SKU-002" → несколько артикулов (ОШИБКА!)
     * - "SKU-001|SKU-002" → несколько артикулов (ОШИБКА!)
     */
    static parseArticles(articlesStr, countStr) {
        const articles = [];

        if (!articlesStr || !String(articlesStr).trim()) {
            return articles; // Пустой массив для пустой ячейки
        }

        // Разделить артикулы по разделителям (;, |, запятая)
        const articleCodes = String(articlesStr)
            .split(/[;|,]/)
            .map(a => a.trim())
            .filter(a => a && a.length > 0);

        // Разделить количества по разделителям
        const counts = String(countStr || '')
            .split(/[;|,]/)
            .map(c => {
                const num = parseInt(c);
                return isNaN(num) ? 1 : num;
            });

        // Создать объекты артикулов
        for (let i = 0; i < articleCodes.length; i++) {
            articles.push({
                sku: articleCodes[i],
                qty: counts[i] || 1,
                index: i + 1
            });
        }

        return articles;
    }

    /**
     * Создать подробный отчет об ошибках
     */
    static generateErrorReport(results) {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalRows: results.statistics.totalRows,
                cellsProcessed: results.statistics.cellsProcessed,
                cellsOk: results.statistics.cellsOk,
                cellsWithErrors: results.statistics.cellsWithErrors,
                cellsWithMultipleArticles: results.statistics.cellsWithMultipleArticles,
                occupiedCells: results.statistics.occupiedCells,
                emptyCells: results.statistics.emptyCells,
                totalErrors: results.errors.length,
                totalWarnings: results.warnings.length
            },
            errors: results.errors,
            warnings: results.warnings,
            multipleArticlesErrors: results.multipleArticlesErrors
        };

        return report;
    }

    /**
     * Создать HTML отчет для отображения
     */
    static generateHTMLReport(results) {
        let html = `
            <div class="xls-report">
                <h3>📊 Отчет загрузки XLS</h3>
                
                <div class="report-summary">
                    <div class="summary-stat">
                        <strong>Обработано ячеек:</strong> ${results.statistics.cellsProcessed}
                    </div>
                    <div class="summary-stat">
                        <strong>✅ Без ошибок:</strong> <span style="color: green;">${results.statistics.cellsOk}</span>
                    </div>
                    <div class="summary-stat">
                        <strong>❌ С ошибками:</strong> <span style="color: red;">${results.statistics.cellsWithErrors}</span>
                    </div>
                    <div class="summary-stat">
                        <strong>⚠️ Множественные артикулы:</strong> <span style="color: orange;">${results.statistics.cellsWithMultipleArticles}</span>
                    </div>
                </div>
        `;

        // Ошибки множественных артикулов
        if (results.multipleArticlesErrors.length > 0) {
            html += `
                <div class="errors-section" style="background: #fee2e2; border: 2px solid #fecaca; padding: 15px; margin: 10px 0; border-radius: 6px;">
                    <h4 style="color: #991b1b;">⚠️ Ошибки множественных артикулов в одной ячейке:</h4>
                    <ul style="color: #7f1d1d;">
            `;

            for (const error of results.multipleArticlesErrors) {
                html += `
                    <li>
                        <strong>${error.cellId}</strong> - 
                        Найдено ${error.articlesCount} артикулов: 
                        <code style="background: #fff3e0; padding: 2px 6px; border-radius: 3px;">
                            ${error.articles.map(a => a.sku).join(', ')}
                        </code>
                    </li>
                `;
            }

            html += `
                    </ul>
                </div>
            `;
        }

        // Обычные ошибки
        if (results.errors.length > 0 && results.multipleArticlesErrors.length === 0) {
            html += `
                <div class="errors-section" style="background: #fee2e2; border: 2px solid #fecaca; padding: 15px; margin: 10px 0; border-radius: 6px;">
                    <h4 style="color: #991b1b;">❌ Ошибки:</h4>
                    <ul style="color: #7f1d1d;">
            `;

            for (const error of results.errors) {
                if (error.type === 'MULTIPLE_ARTICLES') {
                    html += `<li><strong>${error.cellId}</strong> - ${error.message}</li>`;
                }
            }

            html += `</ul></div>`;
        }

        // Предупреждения
        if (results.warnings.length > 0) {
            html += `
                <div class="warnings-section" style="background: #fef3c7; border: 2px solid #fde047; padding: 15px; margin: 10px 0; border-radius: 6px;">
                    <h4 style="color: #92400e;">⚠️ Предупреждения:</h4>
                    <ul style="color: #78350f;">
            `;

            for (const warning of results.warnings) {
                html += `<li>${warning.cellId} - ${warning.warning}</li>`;
            }

            html += `</ul></div>`;
        }

        html += `</div>`;
        return html;
    }
}

// Для совместимости с существующим кодом
if (typeof XLSArticlesParser === 'undefined') {
    var XLSArticlesParser = XLSArticlesValidator;
}
