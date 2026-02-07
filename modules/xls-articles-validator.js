/**
 * Enhanced XLS Articles Validator
 * Парсит и валидирует XLS файлы с поддержкой:
 * - Множественных артикулов в одной ячейке (ОШИБКА)
 * - Проверки статуса занято/пусто
 * - Визуализации ошибок в интерфейсе
 * 
 * 📊 ПОДДЕРЖИВАЕМЫЙ ФОРМАТ XLS:
 * ┌────────────────────────────────────────────┐
 * │ Столбец C: Название Ячейки                 │
 * │            (OS NA 002 010 049)              │
 * │                                            │
 * │ Столбец D: Статус ячейки                   │
 * │            (Свободна, Занята)              │
 * │                                            │
 * │ Столбец I: Артикулы                        │
 * │            (максимум 1 на ячейку!)         │
 * │            (разделители: ; | ,)            │
 * │            (если > 1: ОШИБКА!)             │
 * └────────────────────────────────────────────┘
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

            // ВАША СТРУКТУРА XLS:
            // Столбец C: Название Ячейки
            // Столбец D: Статус
            // Столбец I: Артикулы
            
            const cellName = this.getCellValue(row, ['Название Ячейки', 'Cell Name', 'Ячейка']);
            const status = this.getCellValue(row, ['Статус', 'Status', 'Статус ячейки']);
            const articlesStr = this.getCellValue(row, ['Артикул', 'SKU', 'Артикулы']);
            const countStr = this.getCellValue(row, ['Кол-во', 'Quantity', 'Кол-во артикулов']);

            // Пропустить пустые строки
            if (!cellName || !cellName.toString().trim()) continue;

            // Нормализовать имя ячейки
            const cellId = this.normalizeCellName(cellName.toString());
            if (!cellId) {
                results.errors.push({
                    row: rowIndex + 1,
                    cellName: cellName,
                    error: 'Неверный формат названия ячейки. Ожидается: A01-01-01-A или OS NA 002 010 049'
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
     * - OS NA 002 010 049 (ваш формат!)
     */
    static normalizeCellName(name) {
        if (!name) return null;

        // Очистить и привести к верхнему регистру
        let cleaned = String(name)
            .trim()
            .toUpperCase();

        // ВАША СТРУКТУРА: "OS NA 002 010 049"
        // Удалить префиксы "OS", "NA" и нормализовать
        cleaned = cleaned
            .replace(/^OS\s*/, '')      // Убрать "OS " в начале
            .replace(/^NA\s*/, '')      // Убрать "NA " в начале
            .replace(/\s+/g, '-')       // Заменить пробелы на дефисы
            .replace(/[^\w\-]/g, '');   // Убрать спецсимволы

        // Попробовать распознать разные форматы
        
        // Формат 1: "002-010-049" (ваш формат после очистки)
        const match1 = cleaned.match(/^(\d{3})-(\d{3})-(\d{3})$/);
        if (match1) {
            // Преобразовать в промежуточный формат (можете оставить как есть)
            return `CELL-${match1[1]}-${match1[2]}-${match1[3]}`;
        }

        // Формат 2: классический "A01-01-01-A"
        const match2 = cleaned.match(/^(A\d{2})-(\d{2})-(\d{2})-([A-Z])$/);
        if (match2) {
            return `${match2[1]}-${match2[2]}-${match2[3]}-${match2[4]}`;
        }

        // Формат 3: "A01 01 01 A" → "A01-01-01-A"
        const match3 = cleaned.match(/^(A\d{2})-(\d{2})-(\d{2})-([A-Z])$/);
        if (match3) {
            return `${match3[1]}-${match3[2]}-${match3[3]}-${match3[4]}`;
        }

        // Формат 4: "A01010A" → "A01-01-01-A"
        const match4 = cleaned.match(/^(A\d{2})(\d{2})(\d{2})([A-Z])$/);
        if (match4) {
            return `${match4[1]}-${match4[2]}-${match4[3]}-${match4[4]}`;
        }

        // Если всё ещё не совпадает, вернуть исходное значение (может быть это новый формат)
        if (cleaned && cleaned.length > 0) {
            return cleaned;
        }

        return null;
    }

    /**
     * Нормализовать статус ячейки
     * Из вашего XLS файла:
     * - "Свободна" → empty
     * - "Занята" → occupied
     */
    static normalizeStatus(status) {
        if (!status) return 'empty';

        const statusStr = String(status).toLowerCase().trim();

        // Проверка für занятые ячейки
        if (statusStr.includes('occu') || 
            statusStr.includes('заня') || 
            statusStr.includes('заполнена') ||
            statusStr === 'true' ||
            statusStr === '1') {
            return 'occupied';
        } 
        // Проверка для пустых ячеек
        else if (statusStr.includes('empt') || 
                 statusStr.includes('пусто') || 
                 statusStr.includes('пуст') ||
                 statusStr.includes('свобод') ||
                 statusStr === 'false' ||
                 statusStr === '0') {
            return 'empty';
        }

        return 'unknown';
    }

    /**
     * Парсить строку артикулов
     * Поддерживает форматы:
     * - пусто (для свободных ячеек) → []
     * - "SKU-001" → один артикул ✅ OK
     * - "SKU-001; SKU-002" → несколько артикулов ❌ ОШИБКА!
     * - "SKU-001|SKU-002" → несколько артикулов ❌ ОШИБКА!
     * - "SKU-001, SKU-002" → несколько артикулов ❌ ОШИБКА!
     * 
     * Возвращает: массив объектов {sku, qty, index}
     * или пустой массив если нет артикулов
     */
    static parseArticles(articlesStr, countStr) {
        const articles = [];

        // Если артикулов нет (пустая ячейка)
        if (!articlesStr || !String(articlesStr).trim()) {
            return articles; // Пустой массив
        }

        // Разделить артикулы по разделителям (;, |, запятая)
        const articleCodes = String(articlesStr)
            .split(/[;|,]/)
            .map(a => a.trim())
            .filter(a => a && a.length > 0);

        // Если после разделения остались пустые значения
        if (articleCodes.length === 0) {
            return articles;
        }

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
