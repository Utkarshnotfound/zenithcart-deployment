const express = require('express');
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 8002;
const REDIS_URL = process.env.REDIS_URL || 'redis://cart-cache:6379';

app.use(express.json());

// In-memory fallback dictionary if Redis is offline during local execution
const localMemoryCache = {};
let isRedisConnected = false;

// Initialize Redis Client
const redisClient = createClient({ url: REDIS_URL });

redisClient.on('connect', () => {
  console.log(`Connecting to Redis cache at ${REDIS_URL}...`);
});

redisClient.on('ready', () => {
  isRedisConnected = true;
  console.log('Redis cache connection active and ready.');
});

redisClient.on('error', (err) => {
  isRedisConnected = false;
  console.error('Redis cache error / offline:', err.message);
});

// Proactively trigger Redis connection async
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.warn('Redis is offline. Operating in resilient in-memory fallback mode.');
  }
})();

// Endpoint: Retrieve Cart cache
app.get('/cart/:userId', async (req, res) => {
  const { userId } = req.params;
  
  if (isRedisConnected) {
    try {
      const cartData = await redisClient.get(`cart:${userId}`);
      if (cartData) {
        return res.json(JSON.parse(cartData));
      }
      return res.status(404).json({ message: 'Cart cache not found for user', items: [] });
    } catch (err) {
      console.error('Error fetching from Redis:', err.message);
      // Fall through to memory fallback on database failure
    }
  }
  
  // Resilient memory fallback
  if (localMemoryCache[userId]) {
    return res.json(localMemoryCache[userId]);
  }
  return res.status(404).json({ message: 'Cart not found in local memory cache', items: [] });
});

// Endpoint: Update Cart cache
app.post('/cart/:userId', async (req, res) => {
  const { userId } = req.params;
  const { items } = req.body;
  
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Invalid cart format. Expected key: items (Array)' });
  }
  
  const cartPayload = {
    userId: userId,
    items: items,
    updatedAt: new Date().toISOString()
  };
  
  if (isRedisConnected) {
    try {
      // Store in Redis with 24 hour Time-To-Live (TTL)
      await redisClient.set(`cart:${userId}`, JSON.stringify(cartPayload), {
        EX: 86400 // 24 Hours
      });
      console.log(`Updated Redis cart cache for ${userId}. Items: ${items.length}`);
      return res.json(cartPayload);
    } catch (err) {
      console.error('Error saving to Redis:', err.message);
      // Fall through to memory fallback on database failure
    }
  }
  
  // Resilient memory fallback
  localMemoryCache[userId] = cartPayload;
  console.log(`Updated local memory cart cache for ${userId}. Items: ${items.length}`);
  return res.json(cartPayload);
});

// Endpoint: Clear Cart cache
app.delete('/cart/:userId', async (req, res) => {
  const { userId } = req.params;
  
  if (isRedisConnected) {
    try {
      await redisClient.del(`cart:${userId}`);
      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting from Redis:', err.message);
    }
  }
  
  delete localMemoryCache[userId];
  return res.status(204).send();
});

// Endpoint: Health checks
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'cart-cache',
    redis: isRedisConnected ? 'connected' : 'offline (resilient fallback active)',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Cart Cache Service running on port ${PORT}`);
});
