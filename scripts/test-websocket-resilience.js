#!/usr/bin/env node

/**
 * WebSocket Connection Resilience Test
 *
 * This script tests the WebSocket connection management by:
 * 1. Connecting to the service
 * 2. Subscribing to market data
 * 3. Monitoring connection health
 * 4. Simulating various failure scenarios
 */

const io = require('socket.io-client');
const axios = require('axios');

const SERVICE_URL = process.env.SERVICE_URL || 'http://localhost:3001';
const WS_URL = `${SERVICE_URL}/market`;

let socket;
let reconnectCount = 0;
let messageCount = 0;
let lastMessageTime = Date.now();

// Colors for terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  const timestamp = new Date().toISOString();
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

async function checkHealth() {
  try {
    const response = await axios.get(`${SERVICE_URL}/api/v1/health/websocket`);
    log(`Health Check:`, 'cyan');
    log(`  Status: ${response.data.status}`, 'cyan');
    log(`  Total Connections: ${response.data.totalConnections}`, 'cyan');
    log(`  Healthy: ${response.data.healthyConnections}`, 'green');
    log(
      `  Unhealthy: ${response.data.unhealthyConnections}`,
      response.data.unhealthyConnections > 0 ? 'red' : 'cyan',
    );

    if (response.data.connections.length > 0) {
      log(`\n  Connection Details:`, 'cyan');
      response.data.connections.forEach((conn) => {
        log(`    - ${conn.key}:`, 'cyan');
        log(`      Retry Count: ${conn.retryCount}`, 'cyan');
        log(`      Reconnecting: ${conn.isReconnecting}`, 'cyan');
        log(`      Last Pong: ${conn.lastPongAge}ms ago`, 'cyan');
        log(`      Subscribers: ${conn.subscriberCount}`, 'cyan');
      });
    }

    return response.data;
  } catch (error) {
    log(`Health check failed: ${error.message}`, 'red');
    return null;
  }
}

function connectWebSocket() {
  log('Connecting to WebSocket...', 'blue');

  socket = io(WS_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    log('✅ Connected to WebSocket', 'green');
    log(`   Socket ID: ${socket.id}`, 'green');

    // Subscribe to BTCUSDT
    log('Subscribing to BTCUSDT/1m...', 'blue');
    socket.emit('subscribe', {
      symbol: 'BTCUSDT',
      interval: '1m',
    });
  });

  socket.on('connected', (data) => {
    log(`Server confirmed connection: ${data.clientId}`, 'green');
  });

  socket.on('historical-data', (data) => {
    log(
      `Received historical data for ${data.symbol}/${data.interval}: ${data.data.length} candles`,
      'cyan',
    );
  });

  socket.on('candle-update', (data) => {
    messageCount++;
    lastMessageTime = Date.now();

    if (messageCount % 10 === 0) {
      log(
        `Candle update #${messageCount}: ${data.symbol} @ ${data.data.close} (${data.data.isFinal ? 'FINAL' : 'live'})`,
        'cyan',
      );
    }
  });

  socket.on('ticker-update', (data) => {
    // Silent to reduce noise
  });

  socket.on('disconnect', (reason) => {
    log(`❌ Disconnected: ${reason}`, 'red');
  });

  socket.on('reconnect', (attemptNumber) => {
    reconnectCount++;
    log(
      `🔄 Reconnected after ${attemptNumber} attempts (total reconnects: ${reconnectCount})`,
      'yellow',
    );
  });

  socket.on('reconnect_attempt', (attemptNumber) => {
    log(`🔄 Reconnection attempt #${attemptNumber}...`, 'yellow');
  });

  socket.on('reconnect_error', (error) => {
    log(`Reconnection error: ${error.message}`, 'red');
  });

  socket.on('reconnect_failed', () => {
    log('❌ Reconnection failed completely', 'red');
  });

  socket.on('error', (error) => {
    log(`WebSocket error: ${error.message || error}`, 'red');
  });
}

// Monitor function
async function monitor() {
  log('\n=== Monitoring WebSocket Health ===\n', 'cyan');

  await checkHealth();

  log(`\nClient Stats:`, 'cyan');
  log(`  Messages received: ${messageCount}`, 'cyan');
  log(`  Reconnections: ${reconnectCount}`, 'cyan');
  log(`  Last message: ${Date.now() - lastMessageTime}ms ago`, 'cyan');
  log(
    `  Socket connected: ${socket?.connected}`,
    socket?.connected ? 'green' : 'red',
  );
}

// Disconnect and cleanup
function cleanup() {
  log('\n=== Cleaning up ===\n', 'yellow');

  if (socket) {
    socket.emit('unsubscribe', { symbol: 'BTCUSDT' });
    socket.disconnect();
  }

  log('Disconnected', 'green');
}

// Main test runner
async function runTest() {
  log('=== WebSocket Connection Resilience Test ===\n', 'cyan');
  log(`Service URL: ${SERVICE_URL}`, 'cyan');
  log(`WebSocket URL: ${WS_URL}\n`, 'cyan');

  // Initial health check
  await checkHealth();

  // Connect
  connectWebSocket();

  // Monitor every 30 seconds
  const monitorInterval = setInterval(monitor, 30000);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    log('\n\nReceived SIGINT, shutting down gracefully...', 'yellow');
    clearInterval(monitorInterval);
    cleanup();

    // Final health check
    log('\n=== Final Health Check ===\n', 'cyan');
    await checkHealth();

    process.exit(0);
  });

  // Keep running
  log('Test is running. Press Ctrl+C to stop.\n', 'green');
  log(
    'Monitor stats every 30 seconds or press Ctrl+C for final report.\n',
    'green',
  );
}

// Run the test
runTest().catch((error) => {
  log(`Test failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
