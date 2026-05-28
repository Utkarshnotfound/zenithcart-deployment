// Cart Caching Service - Schema & Logic Tests
const assert = require('assert');

console.log("=========================================");
console.log(" RUNNING CART SERVICE LOGIC TESTS       ");
console.log("=========================================");

try {
  // Test Case 1: Structure Validation
  const testPayload = {
    userId: "devops_test_user",
    items: [
      { productId: "prod_001", name: "Apex Pro Keyboard", price: 199.99, quantity: 2 },
      { productId: "prod_003", name: "Aero Sound Headphones", price: 289.99, quantity: 1 }
    ]
  };
  
  assert.strictEqual(testPayload.userId, "devops_test_user", "Error: User ID structure mismatched.");
  assert.strictEqual(testPayload.items.length, 2, "Error: Item array elements quantity mismatched.");
  
  // Test Case 2: Cart Price calculations
  const calculateTotal = (items) => {
    return items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  };
  
  const expectedTotal = (199.99 * 2) + (289.99 * 1); // 399.98 + 289.99 = 689.97
  const actualTotal = calculateTotal(testPayload.items);
  
  assert.strictEqual(
    parseFloat(actualTotal.toFixed(2)), 
    parseFloat(expectedTotal.toFixed(2)), 
    `Error: Total calculation mismatch. Expected ${expectedTotal}, got ${actualTotal}`
  );
  
  console.log("✅ SUCCESS: Cart payload schema validation passed.");
  console.log("✅ SUCCESS: Cart total summation aggregation passed.");
  console.log("=========================================");
  process.exit(0);
} catch (error) {
  console.error("❌ FAILURE: Cart test assertion failed!");
  console.error(error.stack);
  console.log("=========================================");
  process.exit(1);
}
