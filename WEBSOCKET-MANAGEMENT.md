# WebSocket Connection Management

## 🎯 Overview

Service sử dụng WebSocket để kết nối với Binance Streams với các tính năng production-ready:

- ✅ **Automatic Reconnection** với exponential backoff
- ✅ **Connection Health Monitoring** với ping/pong heartbeat
- ✅ **Proper Cleanup** khi có lỗi hoặc shutdown
- ✅ **Memory Leak Prevention**
- ✅ **Max Retry Limits** để tránh infinite loops
- ✅ **Race Condition Prevention**

---

## 🔧 Configuration

### Constants (có thể move to ENV)

```typescript
MAX_RETRY_ATTEMPTS = 10; // Tối đa 10 lần retry
INITIAL_RETRY_DELAY = 1000; // Delay ban đầu 1 giây
MAX_RETRY_DELAY = 60000; // Max delay 1 phút
PING_INTERVAL = 30000; // Ping mỗi 30 giây
PONG_TIMEOUT = 10000; // Timeout 10 giây
```

---

## 📊 Reconnection Strategy

### Exponential Backoff:

```
Attempt 1: 1 second
Attempt 2: 2 seconds
Attempt 3: 4 seconds
Attempt 4: 8 seconds
Attempt 5: 16 seconds
Attempt 6: 32 seconds
Attempt 7: 60 seconds (max)
Attempt 8: 60 seconds
Attempt 9: 60 seconds
Attempt 10: 60 seconds
Then: Give up
```

---

## 🏥 Health Monitoring

### Endpoint: `GET /api/v1/health/websocket`

**Response:**

```json
{
  "status": "healthy",
  "totalConnections": 5,
  "healthyConnections": 5,
  "unhealthyConnections": 0,
  "connections": [
    {
      "key": "BTCUSDT:1m",
      "retryCount": 0,
      "isReconnecting": false,
      "lastPongAge": 15234,
      "subscriberCount": 3
    }
  ],
  "timestamp": "2026-01-15T10:30:00.000Z"
}
```

### Status Definitions:

- **healthy**: All connections open, no reconnecting
- **degraded**: Some connections reconnecting or unhealthy
- **down**: All connections failed

---

## 🔄 Connection Lifecycle

### 1. Initial Connection

```
Client subscribes → Create WS connection → Start heartbeat
```

### 2. Normal Operation

```
Receive data → Parse → Broadcast to subscribers → Send ping every 30s
```

### 3. Error Handling

```
Error detected → Cleanup timers → Close connection → Schedule reconnect
```

### 4. Reconnection

```
Wait (exponential backoff) → Check subscribers still exist → Reconnect
```

### 5. Cleanup

```
No subscribers left → Cancel reconnect timer → Close connection → Remove from map
```

---

## 🛡️ Error Scenarios Handled

### 1. Network Error

- WebSocket emits `error` event
- Service immediately cleans up and schedules reconnect
- Uses exponential backoff

### 2. Connection Timeout

- Ping/pong mechanism detects dead connections
- If no pong received within 40s (30s + 10s timeout)
- Connection is terminated and reconnected

### 3. Binance Server Restart

- WebSocket emits `close` event with code
- Service logs code and reason
- Automatically reconnects

### 4. Max Retries Exceeded

- After 10 failed attempts, service gives up
- Removes all subscriptions for that connection
- Logs error for monitoring

### 5. Service Shutdown

- `onModuleDestroy()` is called
- All connections are properly closed
- All timers are cleared
- No memory leaks

---

## 🚨 Monitoring & Alerts

### Recommended Alerts:

1. **Unhealthy Connections**

   ```
   If unhealthyConnections > 0 for > 5 minutes
   → Alert: WebSocket degraded
   ```

2. **High Retry Count**

   ```
   If any connection.retryCount > 5
   → Warning: Connection unstable
   ```

3. **No Healthy Connections**

   ```
   If healthyConnections == 0 AND totalConnections > 0
   → Critical: All WebSockets down
   ```

4. **Last Pong Age**
   ```
   If lastPongAge > 45000ms
   → Warning: Connection might be dead
   ```

---

## 🧪 Testing Connection Resilience

### Manual Test Script:

```bash
# 1. Start service
npm run start:dev

# 2. Subscribe to a symbol via WebSocket Gateway

# 3. Simulate network issues:
# - Block Binance IPs temporarily
# - Use proxy to inject delays
# - Kill connection from Binance side

# 4. Check health endpoint:
curl http://localhost:3001/api/v1/health/websocket

# 5. Verify:
# - Reconnection attempts are logged
# - Exponential backoff is working
# - Connection recovers automatically
```

---

## 📝 Logs Example

### Normal Operation:

```
[BinanceWebsocketService] ✅ WebSocket connected for BTCUSDT:1m
[BinanceWebsocketService] Client subscribed to BTCUSDT/1m
```

### Connection Failure:

```
[BinanceWebsocketService] ❌ WebSocket error for BTCUSDT:1m: Connection refused
[BinanceWebsocketService] 🔄 Scheduling reconnection for BTCUSDT:1m (attempt 1/10) in 1000ms
[BinanceWebsocketService] ✅ WebSocket connected for BTCUSDT:1m
```

### Max Retries:

```
[BinanceWebsocketService] 🔄 Scheduling reconnection for BTCUSDT:1m (attempt 10/10) in 60000ms
[BinanceWebsocketService] ❌ Max retry attempts reached for BTCUSDT:1m, giving up
```

### Graceful Shutdown:

```
[BinanceWebsocketService] Shutting down all WebSocket connections...
[BinanceWebsocketService] Cleaned up connection for BTCUSDT:1m
[BinanceWebsocketService] All WebSocket connections closed
```

---

## 🎓 Best Practices

### 1. Monitor Health Endpoint

- Set up automated monitoring
- Alert on degraded state
- Track retry counts

### 2. Log Analysis

- Use structured logging (consider adding)
- Track connection duration
- Monitor reconnection frequency

### 3. Resource Limits

- Limit concurrent connections per client
- Set max subscribers per symbol
- Monitor memory usage

### 4. Graceful Degradation

- Cache last known values
- Return stale data with warning
- Fallback to REST API if WS down

---

## 🔮 Future Improvements

1. **Circuit Breaker Pattern**
   - Stop reconnecting if Binance is globally down
   - Wait for health check before reconnecting

2. **Connection Pooling**
   - Reuse connections for multiple intervals
   - Reduce total connection count

3. **Metrics Export**
   - Prometheus metrics
   - Connection duration histogram
   - Error rate tracking

4. **Configuration via ENV**

   ```env
   WS_MAX_RETRY_ATTEMPTS=10
   WS_INITIAL_RETRY_DELAY=1000
   WS_PING_INTERVAL=30000
   ```

5. **Client-Side Backpressure**
   - Slow down if client can't keep up
   - Drop old messages if queue full
