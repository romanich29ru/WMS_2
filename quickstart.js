/**
 * БЫСТРЫЙ СТАРТ: Функции для работы с XLS и артикулами
 * Включает валидацию множественных артикулов
 * 
 * ╔══════════════════════════════════════════════════╗
 * ║  ПОДДЕРЖИВАЕМЫЙ ФОРМАТ XLS:                     ║
 * ║  Столбец C: Название Ячейки (OS NA 002 010)    ║
 * ║  Столбец D: Статус (Свободна/Занята)           ║
 * ║  Столбец I: Артикулы                            ║
 * ║             1 артикул = ✅ OK                   ║
 * ║             2+ артикула = ⚠️ требует проверки  ║
 * ╚══════════════════════════════════════════════════╝
 */

// ========== ЗАГРУЗКА И ВАЛИДАЦИЯ XLS ==========
/**
 * Улучшенная функция загрузки XLS с валидацией множественных артикулов
 */
async function handleXLSFileUpload(file) {
    if (!file) return;

    console.log('📥 Загрузка XLS файла:', file.name);
    
    try {
        const data = await readXLSFile(file);
        
        // НОВОЕ: Использовать улучшенный валидатор
        if (typeof XLSArticlesValidator !== 'undefined') {
            const results = XLSArticlesValidator.parseAndValidate(data);
            
            // Показать отчет с ошибками
            showXLSValidationReport(results);
            
            // Применить данные
            applyWMSDataToWarehouse(results.cellsData);
            
            console.log('✅ XLS загружена и валидирована');
            console.log('📊 Отчет:', results);
            
            return results;
        } else {
            console.warn('⚠️ XLSArticlesValidator не найден, используем старый парсер');
            const parser = new XLSArticlesParser();
            const { cellsData, errors } = parser.parseArticlesData(data);
            applyWMSDataToWarehouse(cellsData);
            return { cellsData, errors };
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки XLS:', error);
        showXLSError(error.message);
    }
}

/**
 * НОВОЕ: Показать отчет валидации XLS
 * ОБНОВЛЕНО: Множественные артикулы = ВНИМАНИЕ, а не ОШИБКА
 */
function showXLSValidationReport(results) {
    const reportDiv = document.getElementById('xls-report-container') || createReportContainer();
    
    if (results.attentionRequired && results.attentionRequired.length > 0) {
        // Есть ячейки требующие внимания (множественные артикулы)
        const warningHTML = XLSArticlesValidator.generateHTMLReport(results);
        reportDiv.innerHTML = warningHTML;
        reportDiv.style.display = 'block';
        
        // Показать информацию в отдельном модальном окне
        showMultipleArticlesAttentionModal(results.attentionRequired);
    } else if (results.errors && results.errors.length > 0) {
        // Есть ошибки парсинга
        const errorHTML = XLSArticlesValidator.generateHTMLReport(results);
        reportDiv.innerHTML = errorHTML;
        reportDiv.style.display = 'block';
    } else {
        // Всё успешно
        const html = `
            <div class="xls-report" style="background: #dcfce7; border: 2px solid #86efac; color: #166534;">
                <h3>✅ XLS успешно загружена</h3>
                <div class="report-summary">
                    <div class="summary-stat" style="border-left-color: #22c55e;">
                        <strong>Обработано:</strong>
                        <span style="color: #166534;">${results.statistics.cellsProcessed} ячеек</span>
                    </div>
                    <div class="summary-stat" style="border-left-color: #22c55e;">
                        <strong>✅ Успешно:</strong>
                        <span style="color: #166534;">${results.statistics.cellsOk}</span>
                    </div>
                    <div class="summary-stat" style="border-left-color: #22c55e;">
                        <strong>Занято:</strong>
                        <span style="color: #166534;">${results.statistics.occupiedCells}</span>
                    </div>
                    <div class="summary-stat" style="border-left-color: #22c55e;">
                        <strong>Свободно:</strong>
                        <span style="color: #166534;">${results.statistics.emptyCells}</span>
                    </div>
                </div>
            </div>
        `;
        reportDiv.innerHTML = html;
        reportDiv.style.display = 'block';
    }
}

/**
 * НОВОЕ: Показать модальное окно с ячейками требующими внимания (множественные артикулы)
 * ОБНОВЛЕНО: Это не ОШИБКА, а ВНИМАНИЕ - требуется физическая проверка
 */
function showMultipleArticlesAttentionModal(warnings) {
    const modalHTML = `
        <div id="multiple-articles-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 2000; display: flex; align-items: center; justify-content: center;">
            <div style="background: white; border-radius: 8px; padding: 30px; max-width: 700px; max-height: 80vh; overflow-y: auto;">
                <h2 style="color: #92400e; margin: 0 0 20px 0;">⚠️ Внимание: требуется физическая проверка ячеек</h2>
                
                <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 6px; padding: 15px; margin-bottom: 20px; color: #78350f;">
                    <p style="margin: 0 0 10px 0;"><strong>Найдено ${warnings.length} ячеек с несколькими артикулами в системе</strong></p>
                    <p style="margin: 0; font-size: 0.9rem; line-height: 1.6;">
                        ℹ️ Это не ошибка! Данные в системе содержат несколько артикулов для этих адресов.
                        <br>
                        <strong>Ваша задача при проверке:</strong> Физически проверить ячейку и определить, сколько артикулов в ней на самом деле находится.
                        <br>
                        Добавьте комментарий с результатом проверки.
                    </p>
                </div>

                <h4 style="color: #374151; margin-bottom: 10px;">📍 Ячейки для проверки:</h4>
                <div style="max-height: 350px; overflow-y: auto; margin-bottom: 20px;">
    `;

    for (const warning of warnings) {
        modalHTML += `
            <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; margin-bottom: 10px; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong style="font-size: 1.05em; color: #92400e;">📦 ${warning.cellId}</strong>
                        <br>
                        <span style="color: #78350f;">Артикулы в системе:</span>
                        <code style="background: white; padding: 4px 8px; border-radius: 3px; display: inline-block; margin: 4px 0;">
                            ${warning.articles.map(a => a.sku).join(', ')}
                        </code>
                        <br>
                        <small style="color: #a16207;">⚠️ Всего ${warning.articlesCount} артикулов</small>
                    </div>
                    <span style="background: #fcd34d; color: #92400e; padding: 4px 8px; border-radius: 20px; font-size: 0.8rem; white-space: nowrap;">⚠️ Проверить</span>
                </div>
            </div>
        `;
    }

    modalHTML += `
                </div>

                <div style="background: #ecfdf5; border: 1px solid #86efac; border-radius: 6px; padding: 15px; margin-bottom: 20px; color: #065f46;">
                    <strong>📋 Инструкция при проверке ячейки:</strong>
                    <ol style="margin: 8px 0 0 0; padding-left: 20px; font-size: 0.9rem;">
                        <li>Найти ячейку на складе</li>
                        <li>Физически проверить, сколько артикулов в ячейке</li>
                        <li>При внесении статуса ячейки (занята/пуста) добавить комментарий:
                            <ul style="margin: 4px 0 0 0; padding-left: 20px;">
                                <li>Если 1 артикул: "Проверено. В ячейке 1 артикул: [имя артикула]"</li>
                                <li>Если несколько: "В ячейке найдено 2 артикула: [имя1], [имя2]"</li>
                                <li>Если другой артикул: "Найден артикул [имя], а не указанный в системе"</li>
                            </ul>
                        </li>
                    </ol>
                </div>

                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button onclick="this.closest('#multiple-articles-modal').remove()" 
                            style="padding: 10px 20px; background: #e5e7eb; color: #374151; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">
                        ✓ Понял
                    </button>
                    <button onclick="this.closest('#multiple-articles-modal').remove(); goToFirstAttentionCell();" 
                            style="padding: 10px 20px; background: #f59e0b; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">
                        🔍 Начать проверку
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

/**
 * Функция для перехода к первой ячейке требующей внимания
 */
function goToFirstAttentionCell() {
    console.log('🔍 Переход к первой ячейке требующей проверки...');
    // TODO: реализовать логику перехода и открытия модала с комментарием
}

/**
 * Создать контейнер для отчета XLS если его нет
 */
function createReportContainer() {
    const container = document.createElement('div');
    container.id = 'xls-report-container';
    container.style.cssText = 'margin: 20px 0; padding: 20px; background: white; border-radius: 8px;';
    
    // Вставить после modal если есть, иначе в body
    const modal = document.getElementById('modal') || document.getElementById('app');
    if (modal && modal.parentElement) {
        modal.parentElement.insertBefore(container, modal.nextSibling);
    } else {
        document.body.appendChild(container);
    }
    
    return container;
}

/**
 * НОВОЕ: Обновить отображение ячейки в модале если есть множественные артикулы
 */
function displayArticlesWithValidation(cellId, cell) {
    const articlesContainer = document.getElementById('articles-container');
    if (!articlesContainer) return;

    let html = '';

    // ОШИБКА: Множественные артикулы
    if (cell.hasMultipleArticles || (cell.expectedArticles && cell.expectedArticles.length > 1)) {
        html += `
            <div class="modal-articles-error">
                <div class="modal-articles-error-icon">⚠️</div>
                <div class="modal-articles-error-title">
                    ОШИБКА: Несколько артикулов в ячейке!
                </div>
                <div class="modal-articles-error-message">
                    В ячейке <strong>${cellId}</strong> обнаружено 
                    <strong>${(cell.expectedArticles || []).length} артикулов</strong>.
                    <br>В одной ячейке может быть только один артикул.
                    <br><strong style="color: #dc2626;">Требуется исправить XLS файл!</strong>
                </div>
                <ul class="modal-articles-error-list">
        `;

        for (const article of (cell.expectedArticles || [])) {
            html += `<li><strong>${article.sku}</strong> (${article.qty} шт.)</li>`;
        }

        html += `
                </ul>
            </div>
        `;
    }

    // Нормальное отображение артикулов
    if (cell.expectedArticles && cell.expectedArticles.length === 1) {
        const article = cell.expectedArticles[0];
        html += `
            <div class="articles-section">
                <div class="articles-count">
                    📦 Артикул: <strong>${article.sku}</strong>
                </div>
                <div class="article-item">
                    <div class="article-code">${article.sku}</div>
                    <div class="article-qty">${article.qty} шт.</div>
                </div>
                <div class="articles-validation-status ok">
                    ✅ Артикул заполнен корректно
                </div>
            </div>
        `;
    } else if (!cell.expectedArticles || cell.expectedArticles.length === 0) {
        html += `
            <div class="articles-section">
                <div class="articles-empty">
                    📭 Информация об артикулах отсутствует
                </div>
            </div>
        `;
    }

    articlesContainer.innerHTML = html;
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

/**
 * Прочитать XLS файл
 */
async function readXLSFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                resolve(jsonData);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('Ошибка чтения файла'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Применить данные WMS к warehouse
 */
function applyWMSDataToWarehouse(cellsData) {
    if (!cellsData || !warehousesData) return;

    for (const [cellId, cellData] of Object.entries(cellsData)) {
        const [alley, section, tier, position] = cellId.split('-');

        if (warehousesData[alley] && warehousesData[alley][section]) {
            const cell = warehousesData[alley][section].cells.find(c => c.id === cellId);
            if (cell) {
                cell.systemStatus = cellData.systemStatus;
                cell.expectedArticles = cellData.expectedArticles;
                cell.articlesCount = cellData.articlesCount;
                cell.hasMultipleArticles = cellData.hasMultipleArticles;
                cell.articlesError = cellData.articlesError;
            }
        }
    }

    saveData();
    updateOverviewDisplay();
}

/**
 * Показать ошибку XLS
 */
function showXLSError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #fee2e2;
        color: #991b1b;
        padding: 15px 20px;
        border-radius: 6px;
        border-left: 4px solid #ef4444;
        z-index: 10000;
        font-weight: 600;
        max-width: 400px;
    `;
    errorDiv.innerHTML = `❌ ${message}`;
    document.body.appendChild(errorDiv);

    setTimeout(() => errorDiv.remove(), 5000);
}

/**
 * НОВОЕ: Скачать шаблон XLS
 */
function downloadXLSTemplate() {
    const template = [
        {
            'Название Ячейки': 'A01-01-01-A',
            'Статус': 'occupied',
            'Артикул': 'SKU-001',
            'Кол-во': '5',
            'Описание': 'Винты М5'
        },
        {
            'Название Ячейки': 'A01-01-02-A',
            'Статус': 'occupied',
            'Артикул': 'SKU-002',
            'Кол-во': '3',
            'Описание': 'Гайки'
        },
        {
            'Название Ячейки': 'A01-01-03-A',
            'Статус': 'empty',
            'Артикул': '',
            'Кол-во': '',
            'Описание': ''
        }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'WMS Data');
    XLSX.writeFile(wb, 'WMS_Template.xlsx');

    console.log('📥 Шаблон XLS скачан');
}

/**
 * НОВОЕ: Перехватить функцию updateCellStatus для проверки артикулов
 */
const originalUpdateCellStatus = window.updateCellStatus;

function updateCellStatus(status) {
    const cellId = selectedCell.id;
    const cell = getCurrentCell(cellId);

    if (!cell) {
        console.error('❌ Ячейка не найдена:', cellId);
        return;
    }

    // Проверить множественные артикулы
    if (cell.hasMultipleArticles) {
        const confirmed = confirm(
            `⚠️ ВНИМАНИЕ!\n\n` +
            `В ячейке ${cellId} обнаружено несколько артикулов.\n` +
            `В одной ячейке может быть только ОДИН артикул.\n\n` +
            `Требуется исправить XLS файл.\n\n` +
            `Вы уверены, что хотите продолжить?`
        );

        if (!confirmed) {
            console.log('❌ Проверка отменена');
            return;
        }
    }

    // Вызвать оригинальную функцию
    if (originalUpdateCellStatus) {
        originalUpdateCellStatus(status);
    } else {
        // Fallback
        cell.actualStatus = status;
        cell.checked = true;
        cell.checkTime = new Date().toISOString();
        cell.operator = currentOperator || 'unknown';
        saveData();
        closeModal();
    }
}

// ========== 1. ИНИЦИАЛИЗАЦИЯ СИНХРОНИЗАЦИИ ==========
let syncManager = null;
let monitoringManager = null;
let localStorageAdapter = null;

function initSync() {
    // Определить тип устройства
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const deviceType = isMobile ? 'mobile' : 'desktop';

    // Инициализировать sync manager
    syncManager = new RealtimeSyncManager({
        backendType: 'localStorage', // 'localStorage', 'firebase', 'supabase'
        deviceType: deviceType,
        enableLocalSync: true
    });

    // Для локальной синхронизации - опрашивать localStorage
    localStorageAdapter = new LocalStorageSyncAdapter();
    localStorageAdapter.start();

    // Инициализировать monitoring manager для десктопа
    if (deviceType === 'desktop') {
        monitoringManager = new DesktopMonitoringManager(warehousesData, syncManager);
    }

    // Слушать удаленные обновления
    syncManager.on('remote-update', (data) => {
        console.log('📱 Получено обновление с другого устройства:', data);
        
        // Если мы на ПК - обновить топологию
        if (deviceType === 'desktop') {
            const currentAlley = document.getElementById('monitoring-alley-name')?.textContent;
            if (currentAlley && document.getElementById('monitoring-mode').classList.contains('active')) {
                openMonitoringMode(currentAlley);
            }
        }
    });

    // Слушать события синхронизации
    syncManager.on('sync-complete', (data) => {
        console.log('✅ Синхронизация завершена');
        updateSyncIndicator();
    });

    syncManager.on('sync-error', (data) => {
        console.error('❌ Ошибка синхронизации:', data.error);
        updateSyncIndicator('error');
    });

    console.log('✓ Синхронизация инициализирована');
    console.log('  Устройство:', deviceType);
    console.log('  ID:', syncManager.config.deviceId);
}

// ========== 2. ПЕРЕХВАТИТЬ ОБНОВЛЕНИЕ СТАТУСА ЯЧЕЙКИ ==========
// Заменить существующую функцию updateCellStatus на эту версию:
const originalUpdateCellStatus = window.updateCellStatus;

function updateCellStatus(status) {
    // Сохранить старый статус для отладки
    const cellId = selectedCell.id;
    const cell = getCurrentCell(cellId);
    const oldStatus = cell.actualStatus;

    // Вызвать оригинальную функцию
    if (originalUpdateCellStatus) {
        originalUpdateCellStatus(status);
    } else {
        // Fallback если функция не определена
        cell.actualStatus = status;
        cell.checked = true;
        cell.checkTime = new Date().toISOString();
        cell.operator = currentOperator;
        saveData();
    }

    // ========== СИНХРОНИЗИРОВАТЬ С ДРУГИМИ УСТРОЙСТВАМИ ==========
    if (syncManager && cellId) {
        syncManager.queueCellChange(cellId, {
            actualStatus: status,
            systemStatus: cell.systemStatus,
            checkTime: new Date().toISOString(),
            operator: currentOperator,
            discrepancy: cell.discrepancy,
            oldStatus: oldStatus
        });
    }

    closeModal();
}

// ========== 3. ИНДИКАТОР СИНХРОНИЗАЦИИ ==========
function updateSyncIndicator(status = 'synced') {
    if (!syncManager) return;

    const indicator = document.getElementById('sync-indicator');
    const dot = document.getElementById('sync-status-dot');
    const text = document.getElementById('sync-status-text');
    const queueCountEl = document.getElementById('queue-count');

    if (!indicator) return; // Элемент не подключен в HTML

    const queueStatus = syncManager.getSyncQueueStatus();

    indicator.style.display = 'flex';

    // Обновить статус точки
    dot.className = 'sync-status-dot';
    if (status === 'error') {
        dot.classList.add('error');
        text.textContent = 'Ошибка синхронизации';
    } else if (queueStatus.pending > 0) {
        dot.classList.add('syncing');
        text.textContent = `Синхронизируется (${queueStatus.pending} в очереди)`;
    } else {
        dot.classList.add('synced');
        text.textContent = 'Синхронизировано';
    }

    // Показать/скрыть счетчик очереди
    if (queueStatus.pending > 0) {
        document.getElementById('sync-queue-count').style.display = 'inline';
        queueCountEl.textContent = queueStatus.pending;
    } else {
        document.getElementById('sync-queue-count').style.display = 'none';
    }
}

// ========== 4. РЕЖИМ МОНИТОРИНГА АЛЛЕИ ==========
function openMonitoringMode(alley) {
    if (!monitoringManager) {
        alert('Режим мониторинга доступен только на ПК');
        return;
    }

    const topology = monitoringManager.generateAlleyTopology(alley);
    if (!topology) {
        alert('❌ Нет данных для аллеи ' + alley);
        return;
    }

    // Показать контейнер мониторинга
    const monitoringMode = document.getElementById('monitoring-mode');
    if (!monitoringMode) {
        alert('Режим мониторинга не подключен в HTML');
        return;
    }

    monitoringMode.classList.add('active');
    document.getElementById('monitoring-alley-name').textContent = alley;

    // Генерировать топологию
    const container = document.getElementById('topology-container');
    container.innerHTML = monitoringManager.generateTopologyHTML(topology);

    // Обновить статистику
    document.getElementById('stat-total').textContent = topology.totalCells;
    document.getElementById('stat-checked').textContent = topology.checkedCells;
    document.getElementById('stat-discrepancy').textContent = topology.discrepancies;
    document.getElementById('stat-errors').textContent = topology.errors;

    // Добавить обработчики кликов на ячейки
    container.querySelectorAll('.topology-cell').forEach(cellEl => {
        cellEl.addEventListener('click', (e) => {
            const cellId = e.target.dataset.cellId;
            if (cellId) showCellDetailsPopup(cellId, e.clientX, e.clientY);
        });

        // Подсветка при наведении
        cellEl.addEventListener('mouseenter', () => {
            cellEl.style.transform = 'scale(1.15)';
            cellEl.style.zIndex = '10';
        });

        cellEl.addEventListener('mouseleave', () => {
            cellEl.style.transform = 'scale(1)';
            cellEl.style.zIndex = '1';
        });
    });

    console.log(`✓ Открыт режим мониторинга для аллеи ${alley}`);
    console.log(`  Всего ячеек: ${topology.totalCells}`);
    console.log(`  Проверено: ${topology.checkedCells}`);
}

// Закрыть режим мониторинга
function closeMonitoringMode() {
    const monitoringMode = document.getElementById('monitoring-mode');
    if (monitoringMode) {
        monitoringMode.classList.remove('active');
    }
}

// Установить фильтр мониторинга
function setMonitoringFilter(filterType, filterValue) {
    if (!monitoringManager) return;

    monitoringManager.setFilters({ [filterType]: filterValue });

    // Обновить активные кнопки
    document.querySelectorAll('.monitoring-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Перерисовать
    const alley = document.getElementById('monitoring-alley-name').textContent;
    openMonitoringMode(alley);
}

// Показать детали ячейки в popup
function showCellDetailsPopup(cellId, x, y) {
    const [alley, section, tier, position] = cellId.split('-');
    
    if (!warehousesData[alley] || !warehousesData[alley][section]) {
        console.error('❌ Ячейка не найдена:', cellId);
        return;
    }

    const cell = warehousesData[alley][section].cells.find(c => c.id === cellId);
    if (!cell) return;

    // Основная информация
    let html = `
        <div class="cell-details-popup" style="left: ${Math.min(x, window.innerWidth - 320)}px; top: ${Math.min(y, window.innerHeight - 200)}px;">
            <button class="popup-close" onclick="this.parentElement.remove()">✕</button>
            <h3 style="margin: 0 0 10px 0; border-bottom: 2px solid #3498db; padding-bottom: 8px;">
                ${cellId}
            </h3>
    `;

    // Информация о статусах
    html += `
        <div style="margin: 10px 0; font-size: 0.9rem;">
            <p style="margin: 5px 0;"><strong>📊 Статус система:</strong> <code>${cell.systemStatus || '-'}</code></p>
            <p style="margin: 5px 0;"><strong>✓ Статус факт:</strong> <code>${cell.actualStatus || '-'}</code></p>
    `;

    // Статус проверки
    if (cell.checked) {
        html += `
            <p style="margin: 5px 0; color: #27ae60;"><strong>✅ Проверена</strong></p>
        `;

        if (cell.checkTime) {
            const checkDate = new Date(cell.checkTime);
            html += `<p style="margin: 5px 0; font-size: 0.85rem;">⏰ ${checkDate.toLocaleString('ru')}</p>`;
        }

        if (cell.operator) {
            html += `<p style="margin: 5px 0; font-size: 0.85rem;">👤 ${cell.operator}</p>`;
        }
    } else {
        html += `<p style="margin: 5px 0; color: #e74c3c;"><strong>❌ Не проверена</strong></p>`;
    }

    // Несоответствие
    if (cell.discrepancy) {
        html += `<p style="margin: 5px 0; color: #f39c12;"><strong>⚠️ Несоответствие!</strong></p>`;
    }

    // Фото
    if (cell.photos && cell.photos.length > 0) {
        html += `<p style="margin: 5px 0;"><strong>📷 Фото:</strong> ${cell.photos.length} шт.</p>`;
    }

    html += `</div>`;

    // Убрать существующий popup
    document.querySelectorAll('.cell-details-popup').forEach(p => p.remove());

    // Вставить новый
    document.body.insertAdjacentHTML('beforeend', html);

    // Убрать при клике вне popup
    setTimeout(() => {
        const popup = document.querySelector('.cell-details-popup');
        if (popup) {
            document.addEventListener('click', function onOutsideClick(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', onOutsideClick);
                }
            });
        }
    }, 100);
}

// ========== 5. РЕФРЕШ СТАТИСТИКИ В РЕАЛЬНОМ ВРЕМЕНИ ==========
function startRealtimeStatsUpdate() {
    if (monitoringManager) {
        setInterval(() => {
            const alley = document.getElementById('monitoring-alley-name')?.textContent;
            if (alley && document.getElementById('monitoring-mode').classList.contains('active')) {
                const topology = monitoringManager.generateAlleyTopology(alley);
                if (topology) {
                    // Обновить без перерисовки всей сетки
                    document.getElementById('stat-total').textContent = topology.totalCells;
                    document.getElementById('stat-checked').textContent = topology.checkedCells;
                    document.getElementById('stat-discrepancy').textContent = topology.discrepancies;
                    document.getElementById('stat-errors').textContent = topology.errors;
                }
            }
        }, 2000); // Обновлять каждые 2 секунды
    }
}

// ========== 6. ЭКСПОРТ СИНХРО ОТЧЕТА ==========
function exportSyncReport() {
    if (!syncManager) return;

    const status = syncManager.getSyncQueueStatus();
    const report = {
        exportTime: new Date().toISOString(),
        deviceId: status.deviceId,
        deviceType: status.deviceType,
        backendType: syncManager.config.backendType,
        syncStats: {
            totalInQueue: status.total,
            pending: status.pending,
            synced: status.synced,
            failed: status.failed
        },
        lastSyncTime: new Date(status.lastSyncTime).toISOString(),
        isConnected: status.isConnected
    };

    const csv = `
Device Report,
Date,${new Date().toLocaleString('ru')}
Device ID,${status.deviceId}
Device Type,${status.deviceType}
Backend,${syncManager.config.backendType}

Sync Queue Status,
Total Records,${status.total}
Pending,${status.pending}
Synced,${status.synced}
Failed,${status.failed}
Last Sync,${new Date(status.lastSyncTime).toLocaleString('ru')}
Connected,${status.isConnected ? 'Yes' : 'No'}
    `.trim();

    // Скачать как файл
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
    element.setAttribute('download', `sync-report-${Date.now()}.csv`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    console.log('📊 Отчет синхронизации экспортирован');
}

// ========== 7. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function getCurrentCell(cellId) {
    if (!cellId) return null;
    const [alley, section, tier, position] = cellId.split('-');
    if (warehousesData[alley] && warehousesData[alley][section]) {
        return warehousesData[alley][section].cells.find(c => c.id === cellId);
    }
    return null;
}

function getDeviceInfo() {
    if (!syncManager) return {};
    return syncManager.getDeviceInfo();
}

// Показать информацию о синхронизации в консоли
function debugSync() {
    if (!syncManager) {
        console.log('❌ Синхронизация не инициализирована');
        return;
    }

    console.group('📊 Debug Sync Info');
    console.log('Статус:', syncManager.getSyncQueueStatus());
    console.log('Информация об устройстве:', syncManager.getDeviceInfo());
    console.log('Подключенные устройства:', syncManager.getConnectedDevices());
    console.log('Очередь синхронизации:', syncManager.syncQueue);
    console.groupEnd();
}

// ========== 8. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ ==========
// Добавить в существующий DOMContentLoaded или вызвать напрямую после загрузки:
document.addEventListener('DOMContentLoaded', function() {
    // ... существующий код инициализации ...

    // Инициализировать синхронизацию
    setTimeout(() => {
        initSync();
        updateSyncIndicator();
        startRealtimeStatsUpdate();
    }, 1000); // Подождать, пока warehousesData инициализируется
});

// ========== 9. ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ В КОНСОЛИ ==========
/*
// Открыть режим мониторинга
openMonitoringMode('A01');

// Закрыть режим мониторинга
closeMonitoringMode();

// Экспортировать отчет синхронизации
exportSyncReport();

// Показать отладочную информацию
debugSync();

// Очистить очередь синхронизации
syncManager.clearSyncQueue();

// Вручную запустить синхронизацию
syncManager.sync();

// Слушать все события
syncManager.on('remote-update', (data) => console.log('Удаленное обновление:', data));
syncManager.on('sync-complete', (data) => console.log('Синхро завершена:', data));
syncManager.on('sync-error', (data) => console.log('Ошибка синхро:', data));

// Посмотреть все данные ячейки
const cell = getCurrentCell('A01-01-01-A');
console.log('Данные ячейки:', cell);

// Добавить новые изменение в очередь
syncManager.queueCellChange('A01-01-01-A', {
    actualStatus: 'checked-empty',
    operator: 'test'
});
*/
