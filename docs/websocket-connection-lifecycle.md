# WebSocket Connection Lifecycle Diagram

## 📊 Connection State Machine

```
                    ┌─────────────────┐
                    │   IDLE/NONE     │
                    └────────┬────────┘
                             │
                    subscribe() called
                             │
                             ▼
                    ┌─────────────────┐
                    │   CONNECTING    │◄────────┐
                    └────────┬────────┘         │
                             │                  │
                    WebSocket 'open'            │
                             │                  │
                             ▼                  │
                    ┌─────────────────┐         │
              ┌────►│     OPEN        │         │
              │     │  (Heartbeat ON) │         │
              │     └────────┬────────┘         │
              │              │                  │
              │     Messages flowing            │
              │              │                  │
              │     ┌────────┴────────┐         │
              │     │                 │         │
Pong received │     │  Error/Close    │         │
              │     │  detected       │         │
              │     │                 │         │
              │     ▼                 ▼         │
              │  ┌─────┐         ┌─────────┐   │
              │  │Ping?│         │ CLEANUP │   │
              │  └──┬──┘         └────┬────┘   │
              │     │                 │         │
              │  No pong              │         │
              │  > 40s?              │         │
              │     │                 │         │
              │     ▼                 │         │
              │  ┌────────┐           │         │
              └──│Terminate│          │         │
                 └────┬───┘           │         │
                      │                │         │
                      ▼                ▼         │
                 ┌──────────────────────┐       │
                 │  ERROR/DISCONNECTED  │       │
                 └──────────┬───────────┘       │
                            │                   │
                   Have subscribers?            │
                            │                   │
                    ┌───────┴────────┐          │
                    │                │          │
                   Yes              No          │
                    │                │          │
                    ▼                ▼          │
          ┌──────────────┐    ┌─────────┐     │
          │ RECONNECTING │    │ REMOVED │     │
          │ (Exp. Backoff)    └─────────┘     │
          └──────┬───────┘                     │
                 │                             │
        Retry < MAX_RETRY?                     │
                 │                             │
         ┌───────┴───────┐                     │
         │               │                     │
        Yes             No                     │
         │               │                     │
         │               ▼                     │
         │       ┌─────────────┐               │
         │       │ GIVE UP &   │               │
         │       │ REMOVE SUBS │               │
         │       └─────────────┘               │
         │                                     │
         └─────────────────────────────────────┘
```

---

## 🔄 Reconnection Flow

```
Error/Close Event
      │
      ▼
┌─────────────────────────────┐
│ Check if reconnecting flag  │
│ already set (race condition)│
└──────────┬──────────────────┘
           │
          No
           │
           ▼
┌─────────────────────────────┐
│ Set isReconnecting = true   │
│ Increment retryCount        │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Calculate delay:            │
│ min(                        │
│   1000 * 2^(retry-1),      │
│   60000                     │
│ )                           │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Schedule setTimeout         │
└──────────┬──────────────────┘
           │
      Wait delay
           │
           ▼
┌─────────────────────────────┐
│ Check subscribers still     │
│ exist?                      │
└──────────┬──────────────────┘
           │
      ┌────┴────┐
     Yes        No
      │          │
      ▼          ▼
┌──────────┐  ┌──────────┐
│Reconnect │  │ Cancel & │
│          │  │ Remove   │
└──────────┘  └──────────┘
```

---

## 💓 Heartbeat Mechanism

```
Connection Opens
      │
      ▼
┌─────────────────┐
│ Start Interval  │
│ (30 seconds)    │
└────────┬────────┘
         │
         ▼
    ┌────────────────────┐
    │ Check last pong    │
    │ timestamp          │
    └─────┬──────────────┘
          │
    ┌─────┴─────┐
    │           │
  < 40s      > 40s
    │           │
    ▼           ▼
┌───────┐   ┌──────────┐
│ Send  │   │ Terminate│
│ Ping  │   │ (Dead    │
│       │   │ detected)│
└───┬───┘   └────┬─────┘
    │            │
    │            ▼
    │     ┌──────────────┐
    │     │ Trigger      │
    │     │ Reconnection │
    │     └──────────────┘
    │
    ▼
┌────────┐
│ Wait   │
│ Pong   │
└───┬────┘
    │
    ▼
Update last
pong time
    │
    └─────► Loop back to Check
```

---

## 🧹 Cleanup Process

```
Cleanup Triggered by:
- onModuleDestroy()
- No more subscribers
- Max retry exceeded
- Manual unsubscribe

         │
         ▼
┌─────────────────────────┐
│ Clear reconnect timer   │
│ (if exists)             │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Clear ping interval     │
│ (if exists)             │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Remove all event        │
│ listeners               │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Close WebSocket         │
│ (if open)               │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Delete from connections │
│ Map                     │
└─────────────────────────┘
```

---

## 🎭 Multiple Subscribers Scenario

```
Client 1 subscribes      Client 2 subscribes
to BTCUSDT:1m            to BTCUSDT:1m
      │                        │
      ▼                        │
┌─────────────┐               │
│ Create WS   │               │
│ Connection  │               │
└──────┬──────┘               │
       │                      │
       │◄─────────────────────┘
       │  Reuse existing
       │  connection
       ▼
┌────────────────────────────┐
│ subscriptions.get(key)     │
│ .set(client1Id, callback1) │
│ .set(client2Id, callback2) │
└────────────┬───────────────┘
             │
        Data arrives
             │
             ▼
┌────────────────────────────┐
│ Broadcast to ALL callbacks │
│ - callback1(data)          │
│ - callback2(data)          │
└────────────────────────────┘


Client 1 unsubscribes    Client 2 still active
      │                        │
      ▼                        │
┌─────────────┐               │
│ Remove      │               │
│ client1Id   │               │
└──────┬──────┘               │
       │                      │
  subscribers.size            │
     > 0?                     │
       │                      │
      Yes ────────────────────┘
       │     Keep connection
       │     alive
       ▼
┌─────────────┐
│ Connection  │
│ stays open  │
└─────────────┘


Both clients unsubscribe
      │
      ▼
┌─────────────┐
│ Remove both │
│ callbacks   │
└──────┬──────┘
       │
  subscribers.size
     == 0?
       │
      Yes
       │
       ▼
┌─────────────┐
│ Cleanup &   │
│ Close WS    │
└─────────────┘
```

---

## 📈 Retry Attempt Timeline

```
Attempt  Delay      Cumulative Time
   1     1s         1s
   2     2s         3s
   3     4s         7s
   4     8s         15s
   5     16s        31s
   6     32s        63s
   7     60s        123s (2m 3s)
   8     60s        183s (3m 3s)
   9     60s        243s (4m 3s)
  10     60s        303s (5m 3s)
  ❌     GIVE UP

Total time before giving up: ~5 minutes
```

---

## 🎯 Event Flow

```
Binance WebSocket Server
         │
         │ Push data
         ▼
   ┌───────────┐
   │ ws.on()   │
   │ 'message' │
   └─────┬─────┘
         │
         ▼
   ┌───────────┐
   │ Parse     │
   │ JSON      │
   └─────┬─────┘
         │
    ┌────┴────┐
    │         │
  @kline    @ticker
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│Candle  │ │Ticker  │
│Data    │ │Data    │
└───┬────┘ └───┬────┘
    │          │
    │          │
    ▼          ▼
┌──────────────────┐
│ Get callbacks    │
│ for this key     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ forEach callback │
│ callback(data)   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Client receives  │
│ via Socket.IO    │
│ emit()           │
└──────────────────┘
```
