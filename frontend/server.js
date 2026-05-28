const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

const PRODUCT_SERVICE = process.env.PRODUCT_SERVICE_URL || 'http://product-catalog:8001';
const CART_SERVICE = process.env.CART_SERVICE_URL || 'http://cart-service:8002';
const ORDER_SERVICE = process.env.ORDER_SERVICE_URL || 'http://order-service:8003';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Lightweight dynamic API proxy using Node 18+ native fetch
const proxyTo = (targetUrlBase) => async (req, res) => {
  const relativePath = req.originalUrl.replace(/^\/api/, '');
  const targetUrl = `${targetUrlBase}${relativePath}`;
  
  try {
    const options = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    // Copy authorization header if present
    if (req.headers['authorization']) {
      options.headers['authorization'] = req.headers['authorization'];
    }

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      options.body = JSON.stringify(req.body);
    }

    console.log(`Proxying ${req.method} request to: ${targetUrl}`);
    const response = await fetch(targetUrl, options);
    
    if (response.status === 204) {
      return res.status(204).send();
    }
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error(`Proxy error for ${targetUrl}:`, error.message);
    res.status(502).json({ 
      error: 'Bad Gateway', 
      message: `Failed to communicate with backing microservice at ${targetUrlBase}`,
      details: error.message
    });
  }
};

// Route API proxy requests
app.all('/api/products*', proxyTo(PRODUCT_SERVICE));
app.all('/api/cart*', proxyTo(CART_SERVICE));
app.all('/api/orders*', proxyTo(ORDER_SERVICE));

// Health check endpoint for Docker container orchestration
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'frontend-gateway', 
    timestamp: new Date().toISOString() 
  });
});

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` ZenithCart Frontend API Gateway listening on :${PORT}`);
  console.log(` Routing Configuration:`);
  console.log(`   - Product Service: ${PRODUCT_SERVICE}`);
  console.log(`   - Cart Service:    ${CART_SERVICE}`);
  console.log(`   - Order Service:   ${ORDER_SERVICE}`);
  console.log(`=================================================`);
});
