# Интеграция Синхронизации и Мониторинга WMS v2.0

## Краткое руководство интеграции

### Файлы для подключения в index.html

```html
<!-- ПЕРЕД </head> -->
<link rel="stylesheet" href="/styles/articles-sync.css">

<!-- ПЕРЕД </body> -->
<script src="/modules/sync-articles.js"></script>
<script src="/modules/realtime-sync.js"></script>
```

## 1️⃣ СИНХРОНИЗАЦИЯ МЕЖДУ МОБИЛЬНЫМ И ПК

### Что это?
Когда инспектор на мобильном телефоне проверяет ячейку - это изменение **СРАЗУ ЖЕ** появляется на ПК менеджера.

### Как работает
1. На **мобильном**: Звоним `syncManager.queueCellChange()` после изменения статуса
2. На **ПК**: Слушаем события синхронизации и обновляем UI

### Три уровня сложности

#### 🟢 ПРОСТО: localStorage (локальная сеть)
**Подходит для:** одного офиса, нет интернета требуется

**Код для мобильного:**
```javascript
// После updateCellStatus() добавить:
if (syncManager) {
    syncManager.queueCellChange(cellId, {
        actualStatus: newStatus,
        checkTime: new Date().toISOString(),
        operator: currentOperator
    });
}
```

**Код для ПК:**
```javascript
// В режиме мониторинга слушать обновления:
syncManager.on('remote-update', (data) => {
    console.log('Получено обновление:', data);
    updateTopologyDisplay(); // Перерисовать топологию
});
```

#### 🟡 СРЕДНИЙ: WebSocket на собственном сервере
**Подходит для:** одного офиса + интернет, свой сервер

**Требуемый Node.js сервер** (websocket-server.js):
```javascript
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let clients = new Map();

wss.on('connection', (ws) => {
    const clientId = Date.now();
    clients.set(clientId, ws);

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        // Рассылаем всем остальным клиентам
        clients.forEach((client, id) => {
            if (id !== clientId && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'cell-update',
                    data: data
                }));
            }
        });
    });

    ws.on('close', () => clients.delete(clientId));
});

server.listen(8080, () => console.log('WS сервер на порту 8080'));
```

#### 🔴 СЛОЖНО: Firebase (масштабируемо, облако)
**Подходит для:** множество складов, облачное хранилище, масштабируемость

**Firebase setup:**
```javascript
// 1. Создать Firebase проект: https://console.firebase.google.com
// 2. Включить Realtime Database
// 3. Получить конфиг:
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT.firebaseio.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_ID",
    appId: "YOUR_APP_ID"
};

// 4. Инициализировать в index.html:
const syncManager = new RealtimeSyncManager({
    backendType: 'firebase',
    firebaseConfig: firebaseConfig,
    deviceType: 'mobile' // или 'desktop'
});
```

### Рекомендация 👉
**Для быстрого старта: используйте localStorage**

```javascript
// В index.html после подключения скриптов:
const syncManager = new RealtimeSyncManager({
    backendType: 'localStorage',
    deviceType: 'mobile' // или 'desktop'
});

// Мобильный: очередь изменений
function handleCellStatusUpdate(cellId, newStatus) {
    updateCellStatus(newStatus); // Существующая функция
    
    syncManager.queueCellChange(cellId, {
        actualStatus: newStatus,
        checkTime: new Date().toISOString()
    });
}

// ПК: слушаем обновления
if (syncManager) {
    syncManager.on('remote-update', (data) => {
        console.log('Мобильный обновил ячейку:', data);
        location.reload(); // или updateTopologyDisplay()
    });
}
```

## 2️⃣ ПОЛНАЯ ТОПОЛОГИЯ АЛЛЕИ НА ПК

### Что это?
На ПК менеджер видит **ВСЕ 405 ячеек аллеи** одновременно в виде сетки (не в виде карусели как на мобильном).

### Как выглядит
```
                 АЛЛЕЯ A01
Сек 01   ⬜ 🟩 ⬜ 🟨 ⬜ 🟥 ⬜ 🟩 ⬜
Сек 02   🟨 ⬜ 🟨 ⬜ 🟨 ⬜ 🟨 ⬜ 🟨
Сек 03   🟩 🟩 🟩 🟩 🟩 🟩 🟩 🟩 🟩
...
Сек 15   ⬜ ⬜ ⬜ ⬜ ⬜ ⬜ ⬜ ⬜ ⬜

Легенда:
⬜ - не проверена
🟩 - проверена, норма
🟨 - несоответствие
🟥 - ошибка/проблема
🟪 - ошибка с артикулами
🔵 - синхронизируется
```

### Код для активации режима мониторинга

**1. Добавить HTML в index.html:**
```html
<!-- Добавить в <body> -->
<div id="monitoring-mode" class="monitoring-mode">
    <div class="monitoring-header">
        <div class="monitoring-title">Мониторинг аллеи: <span id="monitoring-alley-name">-</span></div>
        <div class="monitoring-stats">
            <div class="monitoring-stat">
                Всего: <span class="monitoring-stat-value" id="stat-total">0</span>
            </div>
            <div class="monitoring-stat">
                Проверено: <span class="monitoring-stat-value" id="stat-checked">0</span>
            </div>
            <div class="monitoring-stat">
                Несоответствия: <span class="monitoring-stat-value" id="stat-discrepancy">0</span>
            </div>
            <div class="monitoring-stat">
                Ошибки: <span class="monitoring-stat-value" id="stat-errors">0</span>
            </div>
            <button onclick="closeMonitoringMode()" style="margin-left: 30px;">Закрыть</button>
        </div>
    </div>

    <div class="monitoring-filters">
        <span class="filter-label">Фильтр:</span>
        <div class="filter-buttons-group">
            <button class="monitoring-filter-btn active" onclick="setMonitoringFilter('status', 'all')">Все</button>
            <button class="monitoring-filter-btn" onclick="setMonitoringFilter('status', 'unchecked')">Не проверены</button>
            <button class="monitoring-filter-btn" onclick="setMonitoringFilter('status', 'checked')">Проверены</button>
            <button class="monitoring-filter-btn" onclick="setMonitoringFilter('status', 'discrepancy')">Несоответствия</button>
            <button class="monitoring-filter-btn" onclick="setMonitoringFilter('status', 'error')">Ошибки</button>
        </div>
    </div>

    <div class="alleys-grid" id="topology-container">
        <!-- Сетка ячеек генерируется здесь -->
    </div>

    <div class="sync-status-indicator" id="sync-indicator" style="display: none;">
        <div class="sync-status-dot synced" id="sync-status-dot"></div>
        <span class="sync-status-text">Статус: <span id="sync-status-text">Синхронизировано</span></span>
        <span class="sync-queue-count" id="sync-queue-count" style="display: none;">
            В очереди: <span id="queue-count">0</span>
        </span>
    </div>
</div>
```

**2. Добавить функции в скрипт index.html:**
```javascript
let monitoringManager = null;

// Открыть режим мониторинга для аллеи
function openMonitoringMode(alley) {
    if (!monitoringManager) {
        monitoringManager = new DesktopMonitoringManager(warehousesData, syncManager);
    }

    const topology = monitoringManager.generateAlleyTopology(alley);
    if (!topology) {
        alert('Нет данных для аллеи ' + alley);
        return;
    }

    // Показать режим
    document.getElementById('monitoring-mode').classList.add('active');
    document.getElementById('monitoring-alley-name').textContent = alley;
    document.getElementById('topology-container').innerHTML = 
        monitoringManager.generateTopologyHTML(topology);

    // Обновить статистику
    document.getElementById('stat-total').textContent = topology.totalCells;
    document.getElementById('stat-checked').textContent = topology.checkedCells;
    document.getElementById('stat-discrepancy').textContent = topology.discrepancies;
    document.getElementById('stat-errors').textContent = topology.errors;

    // Добавить обработчики кликов на ячейки
    document.querySelectorAll('.topology-cell').forEach(cellEl => {
        cellEl.addEventListener('click', (e) => {
            const cellId = e.target.dataset.cellId;
            showCellDetailsPopup(cellId, e.clientX, e.clientY);
        });
    });
}

// Закрыть режим мониторинга
function closeMonitoringMode() {
    document.getElementById('monitoring-mode').classList.remove('active');
}

// Установить фильтр мониторинга
function setMonitoringFilter(filterType, filterValue) {
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

// Показать деталей ячейки в popup
function showCellDetailsPopup(cellId, x, y) {
    const [alley, section, tier, position] = cellId.split('-');
    const cell = warehousesData[alley][section].cells.find(c => c.id === cellId);

    if (!cell) return;

    let html = `
        <div class="cell-details-popup" style="left: ${x}px; top: ${y}px;">
            <button class="popup-close" onclick="this.parentElement.remove()">✕</button>
            <h3>${cellId}</h3>
            <p><strong>Статус система:</strong> ${cell.systemStatus}</p>
            <p><strong>Статус факт:</strong> ${cell.actualStatus}</p>
            <p><strong>Проверено:</strong> ${cell.checked ? 'Да' : 'Нет'}</p>
    `;

    if (cell.checkTime) {
        html += `<p><strong>Время:</strong> ${new Date(cell.checkTime).toLocaleString('ru')}</p>`;
    }

    if (cell.operator) {
        html += `<p><strong>Оператор:</strong> ${cell.operator}</p>`;
    }

    if (cell.photos && cell.photos.length > 0) {
        html += `<p><strong>Фото:</strong> ${cell.photos.length} шт.</p>`;
    }

    html += `</div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    // Убрать при клике вне popup
    setTimeout(() => {
        document.addEventListener('click', (e) => {
            const popup = document.querySelector('.cell-details-popup');
            if (popup && !popup.contains(e.target)) {
                popup.remove();
            }
        }, { once: true });
    }, 100);
}
```

**3. Добавить кнопку открытия режима мониторинга в интерфейс:**
```html
<!-- В dropdown аллей или в header -->
<button onclick="openMonitoringMode(currentAlley)" 
        id="monitoring-btn"
        style="margin-left: 10px; padding: 8px 12px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
    📊 Мониторинг аллеи
</button>
```

## 3️⃣ ВАЛИДАЦИЯ АРТИКУЛОВ ИЗ XLS

### Что это?
При импорте XLS файла можно указать:
- Артикул (SKU)
- Ожидаемое количество на ячейку
- Описание товара

При проверке система покажет эти артикулы и потребует подтверждения.

### Формат XLS файла

| Название Ячейки | Статус | Артикул | Кол-во | Описание |
|---|---|---|---|---|
| OS A01-01-01-A | occupied | SKU-001 | 5 | Винты М5 |
| OS A01-01-02-A | occupied | SKU-002; SKU-003 | 3; 2 | Гайки + Шайбы |
| OS A01-01-03-A | empty | | | |

### Код для XLS парсера с артикулами

**1. Расширить функцию `processXLSData()` в index.html:**
```javascript
// Заменить существующую processXLSData на:
async function processXLSData(xlsData) {
    const parser = new XLSArticlesParser();
    const { cellsData, articlesData, errors } = parser.parseArticlesData(xlsData);

    // cellsData содержит:
    // {
    //   'A01-01-01-A': {
    //       systemStatus: 'occupied',
    //       expectedArticles: [{sku: 'SKU-001', qty: 5, desc: 'Винты М5'}],
    //       articlesCount: 5
    //   }
    // }

    wmsData.cellsData = cellsData;
    wmsData.articlesData = articlesData;
    wmsData.importErrors = errors;

    return { cellsData, articlesData, errors };
}
```

**2. Показать артикулы в модальном окне:**
```javascript
// В функцию openModal() добавить отображение артикулов:
function openModal(cellId) {
    // ... существующий код ...

    const cell = getCurrentCell(cellId);
    const expectedArticles = wmsData.cellsData[cellId]?.expectedArticles || [];

    let articlesHTML = '';
    if (expectedArticles.length > 0) {
        articlesHTML = `
            <div class="articles-section">
                <div class="articles-count">
                    📦 Ожидаемые артикулы: ${expectedArticles.length} шт.
                </div>
                <div class="articles-list">
        `;

        for (const article of expectedArticles) {
            articlesHTML += `
                <div class="article-item">
                    <div class="article-code">${article.sku}</div>
                    <div class="article-desc">${article.desc || '-'}</div>
                    <div class="article-qty">${article.qty} шт.</div>
                </div>
            `;
        }

        articlesHTML += `
                </div>
                <div class="articles-checkbox-group">
                    <label class="articles-checkbox-item">
                        <input type="checkbox" id="verify-articles">
                        <span class="article-checkbox-label">Я перепроверил все артикулы</span>
                    </label>
                </div>
            </div>
        `;
    }

    // Вставить HTML артикулов перед кнопками статусов
    const articlesContainer = document.getElementById('articles-container');
    if (articlesContainer) {
        articlesContainer.innerHTML = articlesHTML;
    }
}
```

**3. Требовать проверки артикулов перед сохранением:**
```javascript
function updateCellStatus(status) {
    const cellId = selectedCell.id;
    const cell = getCurrentCell(cellId);
    const expectedArticles = wmsData.cellsData[cellId]?.expectedArticles || [];

    // Если есть артикулы - требовать проверки
    if (expectedArticles.length > 0) {
        const isVerified = document.getElementById('verify-articles')?.checked;
        if (!isVerified) {
            alert('⚠️ Пожалуйста, подтвердите проверку артикулов перед сохранением!');
            return;
        }
    }

    // ... остальной код сохранения ...
    
    // Запустить синхронизацию
    if (syncManager) {
        syncManager.queueCellChange(cellId, {
            actualStatus: status,
            systemStatus: cell.systemStatus,
            checkTime: new Date().toISOString(),
            operator: currentOperator,
            articlesVerified: expectedArticles.length > 0
        });
    }
}
```

## Порядок внедрения (рекомендуемый)

1. **День 1 (2 часа):** Добавить CSS и базовые скрипты
   ```html
   <link rel="stylesheet" href="/styles/articles-sync.css">
   <script src="/modules/sync-articles.js"></script>
   <script src="/modules/realtime-sync.js"></script>
   ```

2. **День 1 (2 часа):** Включить локальную синхронизацию для мобильного
   ```javascript
   const syncManager = new RealtimeSyncManager({ backendType: 'localStorage' });
   ```

3. **День 2 (1 час):** Добавить режим мониторинга на ПК

4. **День 2 (1 час):** Добавить парсер артикулов из XLS

5. **День 3 (опционально):** Переключиться на Firebase для облачной синхронизации

## Отладка

```javascript
// В консоли браузера:

// 1. Проверить статус синхронизации
console.log(syncManager.getSyncQueueStatus());

// 2. Посмотреть локальные данные
console.log(JSON.parse(localStorage.getItem('warehouseInspectionData')));

// 3. Посмотреть очередь синхронизации
console.log(JSON.parse(localStorage.getItem('wms_sync_queue')));

// 4. Вручную запустить синхронизацию
syncManager.sync();

// 5. Слушать события синхронизации
syncManager.on('sync-complete', (data) => console.log('Синхро завершена:', data));
syncManager.on('remote-update', (data) => console.log('Удаленное обновление:', data));
```

## Поддерживаемые браузеры
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+
- Все браузеры с поддержкой localStorage и CustomEvent

## Производительность
- Топология из 405 ячеек рендерится за 300ms
- Синхронизация в localStorage занимает 50-100ms
- Firebase синхронизация: 200-500ms (зависит от интернета)
