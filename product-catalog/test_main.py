import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_check():
    """Verify that the health check endpoint returns 200 OK and expected structure"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "product-catalog"

def test_get_products_fallback():
    """Verify that products endpoint functions and returns seeded products in offline fallback mode"""
    response = client.get("/products")
    assert response.status_code == 200
    products = response.json()
    assert isinstance(products, list)
    assert len(products) >= 4
    
    # Check that seeded keys exist
    first_product = products[0]
    assert "id" in first_product
    assert "name" in first_product
    assert "price" in first_product
    assert "tag" in first_product
    assert first_product["price"] > 0
