/**
 * Real-time Sync Manager для WMS v2.0
 * Управляет синхронизацией между мобильным и десктопным клиентами
 * 
 * ОПЦИИ:
 * 1. localStorage + WebSocket (легко для локальной сети)
 * 2. Firebase Realtime Database (облако, масштабируемо)
 * 3. Supabase (open-source альтернатива Firebase)
 */

class RealtimeSyncManager {
    constructor(config = {}) {
        this.config = {
            backendType: config.backendType || 'localStorage', // 'localStorage', 'firebase', 'supabase'
            deviceId: config.deviceId || this.generateDeviceId(),
            deviceType: config.deviceType || 'web', // 'mobile', 'desktop', 'web'
            enableLocalSync: config.enableLocalSync !== false,
            serverUrl: config.serverUrl || 'ws://localhost:8080',
            firebaseConfig: config.firebaseConfig || null,
            supabaseUrl: config.supabaseUrl || null,
            supabaseKey: config.supabaseKey || null,
            ...config
        };

        this.syncQueue = [];
        this.listeners = new Map();
        this.connectedDevices = new Map();
        this.lastSyncTime = 0;
        this.ws = null;
        this.isConnected = false;
        this.syncInProgress = false;

        this.initializeBackend();
    }

    // =================== ИНИЦИАЛИЗАЦИЯ ===================
    generateDeviceId() {
        let deviceId = localStorage.getItem('wms_device_id');
        if (!deviceId) {
            deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('wms_device_id', deviceId);
        }
        return deviceId;
    }

    initializeBackend() {
        switch (this.config.backendType) {
            case 'firebase':
                this.initFirebase();
                break;
            case 'supabase':
                this.initSupabase();
                break;
            default:
                this.initLocalStorage();
        }
    }

    initLocalStorage() {
        console.log('Инициализация localStorage синхронизации');
        // Для локальной сети - используем localStorage как "сервер"
        this.loadSyncQueue();
        this.startStorageListener();
    }

    initFirebase() {
        console.log('Firebase инициализация (требуется firebase-app.js)');
        // TODO: Реализовать Firebase Realtime Database
        // Требуется подключить: https://www.gstatic.com/firebasejs/9.0.0/firebase-app.js
        // и firebase-database.js
    }

    initSupabase() {
        console.log('Supabase инициализация (требуется supabase-js)');
        // TODO: Реализовать Supabase Realtime
    }

    // =================== ОСНОВНЫЕ ОПЕРАЦИИ СИНХРОНИЗАЦИИ ===================
    /**
     * Добавить изменение в очередь синхронизации
     */
    queueCellChange(cellId, changes) {
        const syncRecord = {
            id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            deviceId: this.config.deviceId,
            deviceType: this.config.deviceType,
            cellId: cellId,
            alley: cellId.split('-')[0],
            section: cellId.split('-')[1],
            changes: changes,
            status: 'pending',
            retryCount: 0,
            maxRetries: 3
        };

        this.syncQueue.push(syncRecord);
        this.persistSyncQueue();

        // Триггер немедленной синхронизации
        this.sync();

        return syncRecord.id;
    }

    /**
     * Синхронизировать очередь с бэкэндом
     */
    async sync() {
        if (this.syncInProgress || this.syncQueue.length === 0) {
            return;
        }

        this.syncInProgress = true;

        try {
            const recordsToSync = this.syncQueue.filter(r => r.status === 'pending');

            if (recordsToSync.length === 0) {
                this.syncInProgress = false;
                return;
            }

            switch (this.config.backendType) {
                case 'firebase':
                    await this.syncToFirebase(recordsToSync);
                    break;
                case 'supabase':
                    await this.syncToSupabase(recordsToSync);
                    break;
                default:
                    await this.syncToLocalStorage(recordsToSync);
            }

            this.lastSyncTime = Date.now();
            this.notifyListeners('sync-complete', { recordsCount: recordsToSync.length });
        } catch (error) {
            console.error('Ошибка синхронизации:', error);
            this.notifyListeners('sync-error', { error });
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * localStorage синхронизация (для локальной сети)
     */
    async syncToLocalStorage(records) {
        // Обновляем warehouse данные в localStorage
        const warehouseData = JSON.parse(localStorage.getItem('warehouseInspectionData') || '{}');

        for (const record of records) {
            const [alley, section] = [record.alley, record.section];

            if (!warehouseData[alley]) warehouseData[alley] = {};
            if (!warehouseData[alley][section]) warehouseData[alley][section] = { cells: [] };

            const cellIndex = warehouseData[alley][section].cells.findIndex(c => c.id === record.cellId);

            if (cellIndex >= 0) {
                warehouseData[alley][section].cells[cellIndex] = {
                    ...warehouseData[alley][section].cells[cellIndex],
                    ...record.changes,
                    syncedAt: Date.now(),
                    syncedBy: record.deviceId
                };
            }

            // Отметить как синхронизировано
            const queueRecord = this.syncQueue.find(r => r.id === record.id);
            if (queueRecord) {
                queueRecord.status = 'synced';
                queueRecord.syncTime = Date.now();
            }
        }

        localStorage.setItem('warehouseInspectionData', JSON.stringify(warehouseData));

        // Триггер события для других клиентов
        window.dispatchEvent(new CustomEvent('wms-sync-update', {
            detail: { records }
        }));
    }

    // =================== СЛУШАТЕЛИ И СОБЫТИЯ ===================
    /**
     * Подписаться на события синхронизации
     */
    on(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }
        this.listeners.get(eventType).push(callback);

        // Возвращаем функцию для отписки
        return () => {
            const callbacks = this.listeners.get(eventType);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }

    /**
     * Отправить сообщение слушателям
     */
    notifyListeners(eventType, data) {
        const callbacks = this.listeners.get(eventType) || [];
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Ошибка в слушателе ${eventType}:`, error);
            }
        });
    }

    /**
     * Слушать изменения в localStorage (для локальной сети)
     */
    startStorageListener() {
        window.addEventListener('wms-sync-update', (event) => {
            const { records } = event.detail;
            this.notifyListeners('remote-update', { records });
        });

        window.addEventListener('storage', (event) => {
            if (event.key === 'warehouseInspectionData') {
                this.notifyListeners('storage-update', {
                    newData: JSON.parse(event.newValue || '{}'),
                    oldData: JSON.parse(event.oldValue || '{}')
                });
            }
        });
    }

    // =================== УПРАВЛЕНИЕ ОЧЕРЕДЬЮ ===================
    persistSyncQueue() {
        localStorage.setItem('wms_sync_queue', JSON.stringify(this.syncQueue));
    }

    loadSyncQueue() {
        const saved = localStorage.getItem('wms_sync_queue');
        this.syncQueue = saved ? JSON.parse(saved) : [];
    }

    getSyncQueueStatus() {
        const pending = this.syncQueue.filter(r => r.status === 'pending').length;
        const synced = this.syncQueue.filter(r => r.status === 'synced').length;
        const failed = this.syncQueue.filter(r => r.status === 'failed').length;

        return {
            total: this.syncQueue.length,
            pending,
            synced,
            failed,
            lastSyncTime: this.lastSyncTime,
            isConnected: this.isConnected,
            deviceId: this.config.deviceId,
            deviceType: this.config.deviceType
        };
    }

    clearSyncQueue() {
        this.syncQueue = [];
        this.persistSyncQueue();
    }

    // =================== ИНФОРМАЦИЯ ОБ УСТРОЙСТВАХ ===================
    registerDevice(deviceInfo) {
        this.connectedDevices.set(deviceInfo.deviceId, {
            ...deviceInfo,
            registeredAt: Date.now(),
            lastActivity: Date.now()
        });

        this.notifyListeners('device-registered', deviceInfo);
    }

    getConnectedDevices() {
        return Array.from(this.connectedDevices.values());
    }

    // =================== УТИЛИТЫ ===================
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getDeviceInfo() {
        return {
            deviceId: this.config.deviceId,
            deviceType: this.config.deviceType,
            backendType: this.config.backendType,
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language
        };
    }
}

/**
 * Desktop Monitoring Manager - Управление режимом мониторинга на ПК
 */
class DesktopMonitoringManager {
    constructor(warehousesData, syncManager) {
        this.warehousesData = warehousesData;
        this.syncManager = syncManager;
        this.currentAlley = null;
        this.filters = {
            status: 'all', // 'all', 'unchecked', 'checked', 'discrepancy', 'error'
            tier: 'all',   // 'all', 'picking', 'upper'
            search: ''
        };

        this.initEventListeners();
    }

    // =================== РЕНДЕРИНГ ТОПОЛОГИИ ===================
    /**
     * Создать сетку топологии для аллеи
     */
    generateAlleyTopology(alley) {
        const alleyData = this.warehousesData[alley];
        if (!alleyData) return null;

        const topology = {
            alley,
            totalCells: 0,
            checkedCells: 0,
            discrepancies: 0,
            errors: 0,
            sections: []
        };

        for (let section = 1; section <= 15; section++) {
            const sectionKey = String(section).padStart(2, '0');
            const sectionData = alleyData[sectionKey];

            if (!sectionData) continue;

            const sectionTopology = {
                section: sectionKey,
                cells: [],
                stats: { total: 0, checked: 0, discrepancy: 0, error: 0 }
            };

            for (const cell of sectionData.cells) {
                sectionTopology.stats.total++;
                topology.totalCells++;

                // Определить статус ячейки
                const cellStatus = this.determineCellStatus(cell);

                sectionTopology.cells.push({
                    id: cell.id,
                    status: cellStatus,
                    systemStatus: cell.systemStatus,
                    actualStatus: cell.actualStatus,
                    checked: cell.checked,
                    checkTime: cell.checkTime,
                    operator: cell.operator,
                    discrepancy: cell.discrepancy,
                    tier: cell.tier,
                    tierType: this.getTierType(cell.tier),
                    position: cell.position,
                    photosCount: (cell.photos || []).length
                });

                if (cellStatus === 'checked-ok') {
                    sectionTopology.stats.checked++;
                    topology.checkedCells++;
                } else if (cellStatus === 'discrepancy') {
                    sectionTopology.stats.discrepancy++;
                    topology.discrepancies++;
                } else if (cellStatus === 'error' || cellStatus === 'article-error') {
                    sectionTopology.stats.error++;
                    topology.errors++;
                }
            }

            topology.sections.push(sectionTopology);
        }

        return topology;
    }

    /**
     * Определить статус ячейки для отображения
     */
    determineCellStatus(cell) {
        if (!cell.checked) return 'unchecked';
        if (cell.discrepancy) return 'discrepancy';
        if (cell.articleValidation && cell.articleValidation.type !== 'ok') {
            return 'article-error';
        }
        if (cell.actualStatus === 'problem') return 'error';
        return 'checked-ok';
    }

    /**
     * Получить тип яруса (picking vs upper)
     */
    getTierType(tier) {
        const tierNum = parseInt(tier);
        if (tierNum === 2 || tierNum === 3) return 'picking';
        if (tierNum >= 10 && tierNum <= 15) return 'upper';
        return 'middle';
    }

    // =================== ФИЛЬТРАЦИЯ ===================
    setFilters(newFilters) {
        this.filters = { ...this.filters, ...newFilters };
    }

    /**
     * Отфильтровать ячейки по текущим фильтрам
     */
    getFilteredCells(topology) {
        const filtered = [];

        for (const section of topology.sections) {
            for (const cell of section.cells) {
                if (this.matchesFilters(cell)) {
                    filtered.push(cell);
                }
            }
        }

        return filtered;
    }

    matchesFilters(cell) {
        // Фильтр по статусу
        if (this.filters.status !== 'all') {
            if (this.filters.status === 'unchecked' && cell.status !== 'unchecked') return false;
            if (this.filters.status === 'checked' && !cell.checked) return false;
            if (this.filters.status === 'discrepancy' && cell.status !== 'discrepancy') return false;
            if (this.filters.status === 'error' && cell.status !== 'error') return false;
        }

        // Фильтр по ярусу
        if (this.filters.tier !== 'all') {
            if (this.filters.tier === 'picking' && cell.tierType !== 'picking') return false;
            if (this.filters.tier === 'upper' && cell.tierType !== 'upper') return false;
        }

        // Поиск по ID
        if (this.filters.search) {
            if (!cell.id.toLowerCase().includes(this.filters.search.toLowerCase())) {
                return false;
            }
        }

        return true;
    }

    // =================== HTML ГЕНЕРАЦИЯ ===================
    /**
     * Генерировать HTML для сетки топологии
     */
    generateTopologyHTML(topology) {
        let html = `
            <div class="alley-topology">
                <div class="topology-alley-name">${topology.alley}</div>
                <div class="topology-stats">
                    Всего: ${topology.totalCells} | 
                    Проверено: ${topology.checkedCells} | 
                    Несоответствия: ${topology.discrepancies} | 
                    Ошибки: ${topology.errors}
                </div>
        `;

        for (const section of topology.sections) {
            html += `<div class="sections-row">
                <div class="section-label">Сек ${section.section}</div>
                <div class="section-cells">`;

            for (const cell of section.cells) {
                const statusClass = `topology-cell-${cell.status}`;
                const tierHint = `${cell.tier}-${cell.position}`;

                html += `
                    <div class="topology-cell ${statusClass}" 
                         data-cell-id="${cell.id}"
                         title="${cell.id}&#10;Ярус: ${tierHint}&#10;Фото: ${cell.photosCount}">
                        ${cell.id.split('-')[3]}
                    </div>
                `;
            }

            html += `</div></div>`;
        }

        html += `</div>`;
        return html;
    }

    // =================== EVENT LISTENERS ===================
    initEventListeners() {
        if (this.syncManager) {
            this.syncManager.on('remote-update', (data) => {
                console.log('Получено удаленное обновление:', data);
                this.notifyUpdate(data);
            });
        }
    }

    notifyUpdate(data) {
        window.dispatchEvent(new CustomEvent('monitoring-update', { detail: data }));
    }
}

/**
 * Local Storage Sync Adapter - для простой синхронизации на локальной сети
 */
class LocalStorageSyncAdapter {
    constructor() {
        this.pollInterval = 2000; // Опрашивать localStorage каждые 2 сек
        this.pollTimer = null;
        this.lastHash = null;
    }

    start() {
        this.pollTimer = setInterval(() => {
            this.pollForChanges();
        }, this.pollInterval);
    }

    stop() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    pollForChanges() {
        const currentData = localStorage.getItem('warehouseInspectionData');
        const currentHash = this.hashString(currentData);

        if (this.lastHash && this.lastHash !== currentHash) {
            console.log('Обнаружены изменения в данных');
            window.dispatchEvent(new CustomEvent('warehouse-data-changed', {
                detail: { data: JSON.parse(currentData || '{}') }
            }));
        }

        this.lastHash = currentHash;
    }

    hashString(str) {
        let hash = 0;
        if (!str) return hash;

        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString();
    }
}

// Экспорт для использования в index.html
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RealtimeSyncManager,
        DesktopMonitoringManager,
        LocalStorageSyncAdapter
    };
}
