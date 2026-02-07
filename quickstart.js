/**
 * БЫСТРЫЙ СТАРТ: Синхронизация и мониторинг
 * Копировать эти функции прямо в <script> тег index.html
 * 
 * Требуется подключить:
 * - /modules/sync-articles.js
 * - /modules/realtime-sync.js
 * - /styles/articles-sync.css
 */

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
