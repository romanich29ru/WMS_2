# AI Coding Instructions for WMS v2.0

## Project Overview
This is a **Warehouse Management System (WMS) - Cell Inspection Application** (`index.html`) and a variant with XLS integration (`WMS_Пусто_занято.html`). It's a Progressive Web App (PWA) for real-time warehouse inventory verification using a cell-based storage system.

## Architecture

### Key Concepts
- **Alley (Аллея)**: 14 alleys (A01-A14) in the warehouse
- **Section (Секция)**: 15 sections per alley (01-15)
- **Cell (Ячейка)**: 27 cells per section (3 tiers × 9 tiers × 3 positions)
- **Cell ID Format**: `A01-01-15-A` (Alley-Section-Tier-Position)

### Data Structure
```javascript
warehousesData = {
  "A01": {
    "01": {
      cells: [ { id, alley, section, tier, position, systemStatus, actualStatus, checked, checkTime, operator, discrepancy, photos } ],
      checkedTime: null,
      operator: ''
    }
  }
}
```

### Tier Classification
- **Picking Tiers** (02, 03): Low level tiers for picking operations
- **Upper Tiers** (10-15): High level tiers for storage

## Critical Patterns

### 1. Cell Status Management
- `systemStatus`: From WMS/XLS import ('empty', 'occupied', 'unknown')
- `actualStatus`: Inspector finding ('checked-empty', 'discrepancy', 'problem', 'skipped')
- **Discrepancy Detection**: When system status ≠ actual status (occupied but found empty, or vice versa)

### 2. Data Persistence
**localStorage Keys**:
- `warehouseInspectionData`: All inspection results per alley/section
- `warehouseAuditLog`: Complete audit trail of all actions
- `warehouseWMSData`: Imported XLS/CSV data with metadata

**Pattern**: All operations call `saveData()` to persist to localStorage immediately

### 3. Photo Management
- Base64-encoded JPEGs (compressed to ~800px width)
- Max 5 photos per cell
- Stored directly in cell object: `cell.photos[]`
- Compression happens in `compressImage()` using canvas API

### 4. Audit Logging
**Format**:
```javascript
{
  timestamp, action, cellId, oldStatus, newStatus, operator, hasPhoto, alley
}
```
Cap: Last 1000 entries only (`auditLog.slice(-1000)`)

## Developer Workflows

### Import XLS/CSV Data
1. Click "Загрузить XLS" button → `openImportModal()`
2. File parsed with SheetJS library (XLSX.mini.min.js)
3. Auto-detect columns: "Название Ячейки" (cell name) and "Статус" (empty/occupied)
4. Cell name patterns: `OS A01-01-15-A` or `OS A 001 001 015`
5. Applied to `wmsData.cellsData` with `applyWMSDataToWarehouse()`
6. Updates all matched cells' `systemStatus` in warehouse data

### Export CSV Reports
- "Экспорт CSV" exports checked cells from current alley only
- Includes: Cell ID, system status, actual status, discrepancy flag, check time, operator
- UTF-8 BOM prepended for Excel compatibility

### View Inspection History
- "История" modal shows all audit log entries (newest first)
- Filterable by cell ID and date
- Export to CSV via "Экспорт истории"

## Code Organization

### Initialization
- `DOMContentLoaded` → `initAlleysDropdown()` → `generateWarehouseData()` → `setupEventListeners()` → `updateOverviewDisplay()`
- PWA registration in separate event listeners

### View Modes
- **Overview Mode** (`overview-mode`): Grid of sections with stats
- **Inspection Mode** (`inspection-mode`): Carousel of sections, swipe between them

### Key Functions by Purpose

**Warehouse Data**:
- `generateWarehouseData()`: Initialize 14 × 15 × 27 cell structure
- `updateOverviewDisplay()`, `updateGlobalStats()`: Aggregate stats
- `updateSectionsGrid()`: Render section cards with progress

**Cell Verification**:
- `handleCellClick()`, `openModal()`: Select cell
- `updateCellStatus(status)`: Record result and persist
- `logAction()`: Write audit entry

**Import/Export**:
- `parseXLSFile()`: SheetJS parsing
- `processXLSData()`: Validate and extract cell data
- `parseCellName()`: Regex patterns for cell ID formats
- `convertStatus()`: Map WMS status to 'empty'/'occupied'
- `applyWMSDataToWarehouse()`: Update cells from imports

**Photo Handling**:
- `handlePhotoCapture()`: Add photo to cell
- `compressImage()`: Canvas-based JPEG compression
- `openPhotoViewer()`, `closePhotoViewer()`: Modal display

**Carousel Navigation**:
- `goToSection()`: CSS `translateX()` based carousel
- `nextSection()`, `prevSection()`: Update `currentSectionIndex`
- Swipe support via touch event handlers (configured in event listeners)

## State Management
- **Global variables** in `<script>` tag root scope (not ideal, but current architecture)
- **Essential globals**: `currentAlley`, `currentSectionIndex`, `warehousesData`, `auditLog`, `wmsData`
- **UI state**: `isInspecting`, `selectedCell`, `currentFilter`

## Testing & Debugging

### localStorage Debug
- Open DevTools Console: `JSON.parse(localStorage.getItem('warehouseInspectionData'))`
- Clear all: `localStorage.clear()` (development only)

### Import Errors
- Look for detailed error list in import status modal
- Cell name parsing tested against two patterns; check `parseCellName()` for unsupported formats

## Performance Notes
- Carousel uses CSS transforms (GPU-accelerated)
- Photo compression is async to avoid blocking UI
- Audit log capped at 1000 entries; older entries auto-pruned

## Browser Compatibility
- PWA features: Service Worker, Cache API
- Camera access: `capture="environment"` attribute for mobile photo input
- localStorage: All modern browsers (no IndexedDB fallback currently)
