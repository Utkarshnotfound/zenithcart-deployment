// Default configuration constants
const USER_ID = 'devops_user_1';
let currentProducts = [];
let cartItems = [];

// DOM Element Selectors
const productsGrid = document.getElementById('products-grid');
const cartItemsList = document.getElementById('cart-items-list');
const cartSubtotal = document.getElementById('cart-subtotal');
const cartTotal = document.getElementById('cart-total');
const checkoutBtn = document.getElementById('checkout-btn');
const headerCartCount = document.getElementById('header-cart-count');
const ordersTableBody = document.getElementById('orders-table-body');
const toastContainer = document.getElementById('toast-container');

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  fetchProducts();
  fetchCart();
  fetchOrders();
});

// Toast Notification Engine
function showNotification(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✔' : '✖'}</span>
    <div>${message}</div>
  `;
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Fetch and Render Products Catalog
async function fetchProducts() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('Failed to fetch products');
    currentProducts = await res.json();
    renderProducts();
  } catch (err) {
    console.error(err);
    productsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--danger);">
        <p>⚠️ Failed to load catalog products. Is the Product Catalog microservice down?</p>
      </div>
    `;
  }
}

function renderProducts() {
  if (!currentProducts || currentProducts.length === 0) {
    productsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">No catalog items found.</p>';
    return;
  }
  
  productsGrid.innerHTML = currentProducts.map(p => `
    <div class="product-card glass glass-interactive">
      <img src="${p.image || 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=300'}" alt="${p.name}" class="product-image">
      <span class="product-tag ${p.tag === 'New' ? 'tag-new' : 'tag-bestseller'}">${p.tag}</span>
      <h3 class="product-name">${p.name}</h3>
      <p class="product-desc">${p.desc}</p>
      <div class="product-footer">
        <span class="product-price">$${p.price.toFixed(2)}</span>
        <button class="add-btn" onclick="addToCart('${p.id}')">🛒 Add to Cart</button>
      </div>
    </div>
  `).join('');
}

// Fetch and Manage Cart (Redis Cache Microservice)
async function fetchCart() {
  try {
    const res = await fetch(`/api/cart/${USER_ID}`);
    if (res.status === 404) {
      cartItems = [];
      renderCart();
      return;
    }
    if (!res.ok) throw new Error('Failed to retrieve cart cache');
    const data = await res.json();
    cartItems = data.items || [];
    renderCart();
  } catch (err) {
    console.error(err);
    showNotification('Could not load cart cache', 'error');
  }
}

async function updateCartOnServer() {
  try {
    const res = await fetch(`/api/cart/${USER_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cartItems })
    });
    if (!res.ok) throw new Error('Failed to update cart cache on server');
  } catch (err) {
    console.error(err);
    showNotification('Failed to synchronize cart cache', 'error');
  }
}

async function addToCart(productId) {
  const product = currentProducts.find(p => p.id === productId);
  if (!product) return;
  
  const existingItemIndex = cartItems.findIndex(item => item.productId === productId);
  
  if (existingItemIndex > -1) {
    cartItems[existingItemIndex].quantity += 1;
  } else {
    cartItems.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      quantity: 1
    });
  }
  
  renderCart();
  showNotification(`Added ${product.name} to Redis cart!`);
  await updateCartOnServer();
}

async function removeFromCart(productId) {
  const item = cartItems.find(item => item.productId === productId);
  if (!item) return;
  
  cartItems = cartItems.filter(item => item.productId !== productId);
  renderCart();
  showNotification(`Removed ${item.name} from cart!`);
  await updateCartOnServer();
}

function renderCart() {
  const count = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  headerCartCount.textContent = count;
  
  if (cartItems.length === 0) {
    cartItemsList.innerHTML = `
      <div class="empty-cart-state">
        Your cart cache is empty.<br>Add some awesome gear to get started!
      </div>
    `;
    cartSubtotal.textContent = '$0.00';
    cartTotal.textContent = '$0.00';
    checkoutBtn.disabled = true;
    return;
  }
  
  cartItemsList.innerHTML = cartItems.map(item => `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.name}" class="cart-item-img">
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <p>Qty: ${item.quantity} × $${item.price.toFixed(2)}</p>
      </div>
      <div class="cart-item-actions">
        <span class="cart-item-price">$${(item.quantity * item.price).toFixed(2)}</span>
        <button class="remove-item-btn" onclick="removeFromCart('${item.productId}')">Delete</button>
      </div>
    </div>
  `).join('');
  
  const totalVal = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  cartSubtotal.textContent = `$${totalVal.toFixed(2)}`;
  cartTotal.textContent = `$${totalVal.toFixed(2)}`;
  checkoutBtn.disabled = false;
}

// Fetch and Manage Orders (PostgreSQL microservice)
async function fetchOrders() {
  try {
    const res = await fetch('/api/orders');
    if (!res.ok) throw new Error('Failed to load transaction records');
    const orders = await res.json();
    renderOrders(orders);
  } catch (err) {
    console.error(err);
    ordersTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--danger); padding: 25px 0;">
          ⚠️ Order History unreachable. PostgreSQL / Go backend service offline.
        </td>
      </tr>
    `;
  }
}

function renderOrders(orders) {
  if (!orders || orders.length === 0) {
    ordersTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 25px 0;">
          No orders recorded in PostgreSQL yet. Place your first order above!
        </td>
      </tr>
    `;
    return;
  }
  
  ordersTableBody.innerHTML = orders.map(order => {
    // Format timestamp nicely
    const date = new Date(order.createdAt || order.created_at || Date.now());
    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Parse order items summary
    let itemsSummary = '';
    if (Array.isArray(order.items)) {
      itemsSummary = order.items.map(item => `${item.name} (${item.quantity})`).join(', ');
    } else {
      itemsSummary = order.items || 'Products Purchased';
    }

    return `
      <tr>
        <td style="font-family: monospace; font-size: 12px; color: var(--primary);">${(order.id || '').substring(0, 8)}...</td>
        <td>${order.email}</td>
        <td>${order.address}</td>
        <td style="font-size: 13px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemsSummary}">${itemsSummary}</td>
        <td style="font-weight: 700; color: var(--primary);">$${(order.total || 0).toFixed(2)}</td>
        <td><span class="status-badge status-completed">Completed</span></td>
        <td style="font-size: 12px; color: var(--text-muted);">${formattedDate}</td>
      </tr>
    `;
  }).join('');
}

// Checkout Form Submission (Golang PostgreSQL pipeline)
async function handleCheckout(event) {
  event.preventDefault();
  
  const email = document.getElementById('user-email').value;
  const address = document.getElementById('shipping-address').value;
  const totalVal = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  
  checkoutBtn.disabled = true;
  checkoutBtn.textContent = 'Processing Transaction...';
  
  const orderPayload = {
    email: email,
    address: address,
    items: cartItems,
    total: totalVal
  };
  
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });
    
    if (!res.ok) throw new Error('Order creation rejected by service');
    
    const newOrder = await res.json();
    showNotification('Order processed successfully! Recorded in PostgreSQL database.', 'success');
    
    // Reset Cart local state and cache on server
    cartItems = [];
    renderCart();
    await updateCartOnServer();
    
    // Clear forms and reload Order table
    document.getElementById('checkout-form').reset();
    fetchOrders();
  } catch (err) {
    console.error(err);
    showNotification('Failed to submit order. Order service connection interrupted.', 'error');
  } finally {
    checkoutBtn.disabled = cartItems.length === 0;
    checkoutBtn.textContent = '🚀 Dispatch Microservices Order';
  }
}

function scrollToCart() {
  document.getElementById('cart-sidebar').scrollIntoView({ behavior: 'smooth' });
}
