"use strict";
/**
 * Reconciliation Service (P5-02)
 * REST reconciliation for balances, positions, and orders.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReconciliationService = void 0;
const events_1 = require("events");
const crypto_1 = require("crypto");
class ReconciliationService extends events_1.EventEmitter {
    balances = new Map();
    userDataStreamEvents = new Map();
    reconciliationSnapshots = new Map();
    reconciliationResults = new Map();
    constructor(options = {}) {
        super();
    }
    /**
     * Update balance from user data stream
     */
    updateBalance(userId, asset, free, locked) {
        const total = this.addDecimals(free, locked);
        const entry = {
            id: (0, crypto_1.randomUUID)(),
            userId,
            asset,
            free,
            locked,
            total,
            updatedAt: Date.now(),
            createdAt: Date.now(),
        };
        this.balances.set(`${userId}-${asset}`, entry);
        this.emit('balanceUpdated', entry);
        return entry;
    }
    /**
     * Get balance
     */
    getBalance(userId, asset) {
        return this.balances.get(`${userId}-${asset}`) || null;
    }
    /**
     * Get all balances for user
     */
    getBalancesByUser(userId) {
        return Array.from(this.balances.values()).filter((b) => b.userId === userId);
    }
    /**
     * Process user data stream event
     */
    processUserDataStreamEvent(event) {
        const processedEvent = {
            id: event.id || (0, crypto_1.randomUUID)(),
            eventType: event.eventType,
            userId: event.userId,
            symbol: event.symbol,
            payload: event.payload,
            receivedAt: event.receivedAt,
            processed: true,
            processedAt: Date.now(),
        };
        this.userDataStreamEvents.set(processedEvent.id, processedEvent);
        this.emit('userDataStreamEventProcessed', processedEvent);
        return processedEvent;
    }
    /**
     * Create reconciliation snapshot
     */
    createReconciliationSnapshot(userId, snapshotType, symbol, source, data) {
        const snapshot = {
            id: (0, crypto_1.randomUUID)(),
            userId,
            snapshotType,
            symbol,
            source,
            data,
            capturedAt: Date.now(),
            createdAt: Date.now(),
        };
        this.reconciliationSnapshots.set(snapshot.id, snapshot);
        this.emit('reconciliationSnapshotCreated', snapshot);
        return snapshot;
    }
    /**
     * Reconcile against REST API
     * Placeholder: simulates REST reconciliation
     */
    async reconcileWithRest(userId, snapshotType) {
        // Create ledger snapshot
        const ledgerSnapshot = this.createReconciliationSnapshot(userId, snapshotType, null, 'LEDGER', {});
        // Create REST snapshot (placeholder)
        const restSnapshot = this.createReconciliationSnapshot(userId, snapshotType, null, 'REST', {});
        // Compare snapshots (placeholder)
        const match = true; // Placeholder: would compare actual data
        const discrepancies = [];
        const result = {
            id: (0, crypto_1.randomUUID)(),
            userId,
            snapshotId: ledgerSnapshot.id,
            match,
            discrepancies,
            reconciledAt: Date.now(),
            createdAt: Date.now(),
        };
        this.reconciliationResults.set(result.id, result);
        this.emit('reconciliationCompleted', result);
        return result;
    }
    /**
     * Add decimals (placeholder for decimal.js)
     */
    addDecimals(a, b) {
        // Placeholder: would use decimal.js for precise decimal addition
        return '0'; // Simplified
    }
    /**
     * Reset all in-memory state (useful for test isolation)
     */
    reset() {
        this.balances.clear();
        this.userDataStreamEvents.clear();
        this.reconciliationSnapshots.clear();
        this.reconciliationResults.clear();
    }
}
exports.ReconciliationService = ReconciliationService;
//# sourceMappingURL=reconciliationService.js.map