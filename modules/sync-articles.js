// ========== МОДУЛЬ СИНХРОНИЗАЦИИ И ВАЛИДАЦИИ АРТИКУЛОВ ==========
// Файл: modules/sync-articles.js
// Интегрируется в index.html перед основным <script>

/**
 * Синхронизация и валидация артикулов
 * Поддержка: Mobile ↔ Desktop real-time синхронизация
 */

class ArticleValidator {
  /**
   * Валидация количества артикулов в ячейке
   */
  static validateArticlesCount(cell) {
    if (!cell.expectedArticlesCount && cell.expectedArticlesCount !== 0) {
      return {
        hasError: false,
        type: "no_data",
        message: "Нет данных об артикулах"
      };
    }

    if (cell.actualArticlesCount === null || cell.actualArticlesCount === undefined) {
      return {
        hasError: true,
        type: "not_inspected",
        severity: "warning",
        message: "❌ Требуется подтверждение количества артикулов"
      };
    }

    const expected = cell.expectedArticlesCount;
    const actual = cell.actualArticlesCount;

    if (expected === 0 && actual === 0) {
      return { hasError: false, type: "ok_empty" };
    }

    if (expected === 0 && actual > 0) {
      return {
        hasError: true,
        type: "unexpected_items",
        severity: "critical",
        message: `❌ ОШИБКА: Ячейка должна быть пустой, но найдено ${actual} артикулов!`
      };
    }

    if (expected > 0 && actual === 0) {
      return {
        hasError: true,
        type: "missing_items",
        severity: "critical",
        message: `❌ ОШИБКА: Ожидалось ${expected} артикулов, но ячейка пуста!`
      };
    }

    if (expected !== actual) {
      return {
        hasError: true,
        type: "count_mismatch",
        severity: "error",
        expected: expected,
        actual: actual,
        message: `⚠️ РАСХОЖДЕНИЕ: Ожидалось ${expected}, найдено ${actual} артикулов`
      };
    }

    return { hasError: false, type: "ok", message: "✓ Артикулы совпадают" };
  }

  /**
   * Полная валидация артикулов
   */
  static validateArticles(cell) {
    const countValidation = this.validateArticlesCount(cell);

    if (countValidation.type === "not_inspected") {
      return countValidation;
    }

    if (countValidation.hasError && countValidation.type !== "count_mismatch") {
      return countValidation;
    }

    // Проверка конкретных артикулов (если указаны)
    if (cell.actualArticles && cell.actualArticles.length > 0 && cell.articles && cell.articles.length > 0) {
      const expectedCodes = cell.articles.map(a => a.code);
      const actualCodes = cell.actualArticles.map(a => a.code);

      const missing = expectedCodes.filter(c => !actualCodes.includes(c));
      const extra = actualCodes.filter(c => !expectedCodes.includes(c));

      if (missing.length > 0 || extra.length > 0) {
        return {
          hasError: true,
          type: "articles_mismatch",
          severity: "critical",
          missing: missing,
          extra: extra,
          message: `❌ ОШИБКА АРТИКУЛОВ:\nНе хватает: ${missing.join(", ") || "нет"}\nЛишние: ${extra.join(", ") || "нет"}`
        };
      }
    }

    return countValidation;
  }
}

/**
 * Менеджер синхронизации между устройствами
 */
class SyncManager {
  constructor() {
    this.syncQueue = [];
    this.syncEnabled = false;
    this.deviceId = this.generateDeviceId();
    this.lastSyncTime = 0;
    this.syncInterval = 5000; // 5 сек
  }

  generateDeviceId() {
    let deviceId = localStorage.getItem('wms_device_id');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('wms_device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * Определить тип устройства
   */
  static detectDeviceType() {
    const ua = navigator.userAgent;
    if (/mobile|android|iphone|ipad|phone/i.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }

  /**
   * Создать запись о синхронизации
   */
  createSyncRecord(cellId, changes) {
    return {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      deviceId: this.deviceId,
      deviceType: SyncManager.detectDeviceType(),
      cellId: cellId,
      changes: changes,
      syncStatus: 'pending'
    };
  }

  /**
   * Добавить в очередь синхронизации
   */
  queueSync(cellId, changes) {
    const record = this.createSyncRecord(cellId, changes);
    this.syncQueue.push(record);
    localStorage.setItem('wms_sync_queue', JSON.stringify(this.syncQueue));
    return record;
  }

  /**
   * Получить очередь синхронизации
   */
  getSyncQueue() {
    const queue = localStorage.getItem('wms_sync_queue');
    return queue ? JSON.parse(queue) : [];
  }

  /**
   * Сохранить состояние синхронизации других устройств
   */
  saveSyncState(deviceUpdates) {
    const syncState = {
      lastUpdate: new Date().toISOString(),
      devices: deviceUpdates
    };
    localStorage.setItem('wms_sync_state', JSON.stringify(syncState));
  }

  /**
   * Получить состояние синхронизации
   */
  getSyncState() {
    const state = localStorage.getItem('wms_sync_state');
    return state ? JSON.parse(state) : { lastUpdate: null, devices: {} };
  }
}

/**
 * Расширенный парсер XLS с поддержкой артикулов
 */
class XLSArticlesParser {
  /**
   * Парсинг расширенного XLS формата
   * Ожидаемые колонки:
   * - A: Название ячейки
   * - B: Статус (empty/occupied)
   * - C: Кол-во артикулов
   * - D: Артикулы (comma-separated)
   * - E: Описание (опционально)
   */
  static parseArticlesData(xlsData) {
    const results = {
      cellsData: {},
      errors: [],
      warnings: []
    };

    // Найти заголовки
    let headerRowIndex = -1;
    let cellNameCol = -1;
    let statusCol = -1;
    let articlesCountCol = -1;
    let articlesCol = -1;
    let descriptionCol = -1;

    for (let i = 0; i < Math.min(5, xlsData.length); i++) {
      const row = xlsData[i];
      if (!Array.isArray(row)) continue;

      for (let j = 0; j < row.length; j++) {
        const header = String(row[j] || '').toLowerCase().trim();

        if (header.includes('название') && header.includes('ячейк')) {
          cellNameCol = j;
        }
        if (header.includes('статус')) {
          statusCol = j;
        }
        if (header.includes('кол') && header.includes('артикул')) {
          articlesCountCol = j;
        }
        if (header.includes('артикул') && !header.includes('кол')) {
          articlesCol = j;
        }
        if (header.includes('описани') || header.includes('комментари')) {
          descriptionCol = j;
        }
      }

      if (cellNameCol !== -1 && statusCol !== -1) {
        headerRowIndex = i;
        break;
      }
    }

    if (cellNameCol === -1 || statusCol === -1) {
      results.errors.push('Не найдены обязательные колонки: "Название Ячейки" и "Статус"');
      return results;
    }

    results.warnings.push(`Найдены колонки: Ячейка(${cellNameCol}), Статус(${statusCol}), Артикулы(${articlesCountCol})`);

    // Парсинг данных
    for (let i = headerRowIndex + 1; i < xlsData.length; i++) {
      const row = xlsData[i];
      if (!Array.isArray(row) || row.length === 0) continue;

      try {
        const cellName = String(row[cellNameCol] || '').trim();
        const status = String(row[statusCol] || '').trim();

        if (!cellName || !status) continue;

        // Парсинг названия ячейки (используется существующая функция)
        const parsedCell = this.parseCellName(cellName);
        if (!parsedCell) {
          results.errors.push(`Строка ${i + 1}: Неверный формат ячейки "${cellName}"`);
          continue;
        }

        const cellId = `${parsedCell.alley}-${parsedCell.section}-${parsedCell.tier}-${parsedCell.position}`;

        // Парсинг артикулов
        let articlesCount = 0;
        let articles = [];

        if (articlesCountCol !== -1) {
          const countStr = String(row[articlesCountCol] || '0').trim();
          articlesCount = parseInt(countStr) || 0;
        }

        if (articlesCol !== -1 && articlesCount > 0) {
          const articlesStr = String(row[articlesCol] || '').trim();
          if (articlesStr) {
            // Разделить артикулы по запятой или точке с запятой
            const codes = articlesStr.split(/[,;]/).map(a => a.trim()).filter(a => a);

            articles = codes.slice(0, articlesCount).map(code => ({
              code: code,
              description: code, // TODO: можно расширить для описания
              quantity: 1
            }));
          }
        }

        results.cellsData[cellId] = {
          cellId: cellId,
          systemStatus: status.toLowerCase().includes('занят') ? 'occupied' : 'empty',
          expectedArticlesCount: articlesCount,
          articles: articles,
          description: descriptionCol !== -1 ? String(row[descriptionCol] || '').trim() : '',
          parsedData: parsedCell
        };

      } catch (error) {
        results.errors.push(`Строка ${i + 1}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Парсинг названия ячейки (из существующего кода)
   */
  static parseCellName(cellName) {
    const cleanedName = cellName.replace(/\s+/g, ' ').trim();
    const pattern1 = /^([A-Z])(\d{1,2})-(\d{1,2})-(\d{1,2})-([A-C])$/i;
    const pattern2 = /^([A-Z])\s*(\d{3})\s+(\d{3})\s+(\d{3})$/i;

    const match1 = cleanedName.match(pattern1);
    const match2 = cleanedName.match(pattern2);

    if (match1) {
      return {
        alley: match1[1].toUpperCase() + match1[2].padStart(2, '0'),
        section: match1[3].padStart(2, '0'),
        tier: match1[4].padStart(2, '0'),
        position: match1[5].toUpperCase()
      };
    }

    if (match2) {
      return {
        alley: match2[1].toUpperCase() + match2[2].padStart(2, '0').slice(-2),
        section: match2[3].padStart(2, '0'),
        tier: match2[4].padStart(2, '0'),
        position: 'A' // Default
      };
    }

    return null;
  }
}

/**
 * Helpers для UI
 */
const ArticleUI = {
  /**
   * Получить CSS класс для статуса артикулов
   */
  getArticleStatusClass(validation) {
    if (!validation) return 'article-status-unknown';

    switch (validation.severity) {
      case 'critical':
        return 'article-status-critical';
      case 'error':
        return 'article-status-error';
      case 'warning':
        return 'article-status-warning';
      default:
        return validation.hasError ? 'article-status-error' : 'article-status-ok';
    }
  },

  /**
   * Форматированное сообщение об ошибке
   */
  formatErrorMessage(validation) {
    return validation.message || 'Неизвестная ошибка';
  },

  /**
   * HTML для отображения артикулов в модальном окне
   */
  renderArticlesSection(cell) {
    if (!cell.articles || cell.articles.length === 0) {
      return '<div class="articles-empty">Артикулы не указаны</div>';
    }

    const articlesHtml = cell.articles.map((article, index) => `
      <div class="article-item">
        <span class="article-code">${article.code}</span>
        <span class="article-desc">${article.description || ''}</span>
        <span class="article-qty">Кол-во: ${article.quantity}</span>
      </div>
    `).join('');

    return `
      <div class="articles-section">
        <div class="articles-count">Ожидается артикулов: ${cell.expectedArticlesCount}</div>
        <div class="articles-list">
          ${articlesHtml}
        </div>
      </div>
    `;
  }
};

// Экспортирование для использования
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ArticleValidator, SyncManager, XLSArticlesParser, ArticleUI };
}
