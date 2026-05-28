package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleHealth(t *testing.T) {
	req, err := http.NewRequest("GET", "/health", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(handleHealth)

	handler.ServeHTTP(rr, req)

	// Verify status code
	if status := rr.Code; status != http.StatusOK {
		t.Errorf("Handler returned wrong status code: got %v, wanted %v",
			status, http.StatusOK)
	}

	// Verify content-type header
	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Handler returned wrong content type: got %v, wanted %v",
			contentType, "application/json")
	}

	// Verify response body JSON keys
	body := rr.Body.String()
	if !strings.Contains(body, `"status":"healthy"`) {
		t.Errorf("Expected health status key to be healthy. Got: %s", body)
	}
	if !strings.Contains(body, `"service":"order-processing"`) {
		t.Errorf("Expected service tag key to be order-processing. Got: %s", body)
	}
}

func TestHandleOrders_InvalidMethod(t *testing.T) {
	req, err := http.NewRequest("PUT", "/orders", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(handleOrders)

	handler.ServeHTTP(rr, req)

	// Verify PUT returns StatusMethodNotAllowed
	if status := rr.Code; status != http.StatusMethodNotAllowed {
		t.Errorf("Handler allowed PUT method: got status %v, wanted %v",
			status, http.StatusMethodNotAllowed)
	}
}

func TestHandleOrders_PostValidation(t *testing.T) {
	// Send invalid payload (missing email/address)
	invalidPayload := []byte(`{"email":"","address":"","total":0.0}`)
	
	req, err := http.NewRequest("POST", "/orders", bytes.NewBuffer(invalidPayload))
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(handleOrders)

	handler.ServeHTTP(rr, req)

	// Should return 422 Unprocessable Entity
	if status := rr.Code; status != http.StatusUnprocessableEntity {
		t.Errorf("Handler accepted empty payload: got status %v, wanted %v",
			status, http.StatusUnprocessableEntity)
	}
}

func TestOrderFlowInMemory(t *testing.T) {
	// Assert local storage integration is clean
	isDbConnected = false // Force memory mode
	
	payload := []byte(`{
		"email": "test@devops.com",
		"address": "123 Git Lane",
		"items": [{"productId":"prod_001","name":"Keyboard","price":199.99,"quantity":1}],
		"total": 199.99
	}`)

	req, err := http.NewRequest("POST", "/orders", bytes.NewBuffer(payload))
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(handleOrders)

	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusCreated {
		t.Errorf("Failed to post order to memory store: got status %v, wanted %v",
			status, http.StatusCreated)
	}

	var createdOrder Order
	err = json.Unmarshal(rr.Body.Bytes(), &createdOrder)
	if err != nil {
		t.Fatalf("Failed to parse returned JSON order: %v", err)
	}

	if createdOrder.ID == "" {
		t.Error("Order created without a generated UUID ID")
	}

	// Verify order can be retrieved in GET list
	reqGet, _ := http.NewRequest("GET", "/orders", nil)
	rrGet := httptest.NewRecorder()
	handler.ServeHTTP(rrGet, reqGet)

	if status := rrGet.Code; status != http.StatusOK {
		t.Errorf("Failed to retrieve order list: got status %v, wanted %v",
			status, http.StatusOK)
	}

	var list []Order
	json.Unmarshal(rrGet.Body.Bytes(), &list)
	if len(list) == 0 {
		t.Error("Order list is empty after successful post")
	}
}
