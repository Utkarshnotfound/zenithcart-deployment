package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

// Order represents an e-commerce order record
type Order struct {
	ID        string      `json:"id"`
	Email     string      `json:"email"`
	Address   string      `json:"address"`
	Items     interface{} `json:"items"` // Raw JSON of cart items
	Total     float64     `json:"total"`
	CreatedAt time.Time   `json:"createdAt"`
}

var (
	db             *sql.DB
	isDbConnected  bool
	memoryStore    []Order
	storeMutex     sync.RWMutex
	dbConnAttempts int
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8003"
	}

	// Initialize DB Connection asynchronously with retry loop
	go initDatabase()

	// Endpoints
	http.HandleFunc("/orders", handleOrders)
	http.HandleFunc("/health", handleHealth)

	log.Printf("=================================================")
	log.Printf(" Order Processing Service running on port %s", port)
	log.Printf("=================================================")
	
	err := http.ListenAndServe(":"+port, nil)
	if err != nil {
		log.Fatalf("Failed to spin up HTTP server: %v", err)
	}
}

func initDatabase() {
	host := getEnv("POSTGRES_HOST", "order-db")
	user := getEnv("POSTGRES_USER", "postgres")
	password := getEnv("POSTGRES_PASSWORD", "postgres")
	dbname := getEnv("POSTGRES_DB", "orders_db")
	port := getEnv("POSTGRES_PORT", "5432")

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname)

	maxAttempts := 5
	for dbConnAttempts < maxAttempts {
		dbConnAttempts++
		log.Printf("Attempting database connection (%d/%d)...", dbConnAttempts, maxAttempts)
		
		conn, err := sql.Open("postgres", connStr)
		if err == nil {
			err = conn.Ping()
			if err == nil {
				db = conn
				isDbConnected = true
				log.Println("PostgreSQL database connection active and verified.")
				createTableIfNotExists()
				return
			}
		}
		
		log.Printf("Database connection failed: %v. Retrying in 4 seconds...", err)
		time.Sleep(4 * time.Second)
	}

	log.Println("PostgreSQL connection failed all attempts. Resilient in-memory storage fallback active.")
}

func createTableIfNotExists() {
	query := `
	CREATE TABLE IF NOT EXISTS orders (
		id VARCHAR(50) PRIMARY KEY,
		email VARCHAR(100) NOT NULL,
		address VARCHAR(200) NOT NULL,
		items TEXT NOT NULL,
		total NUMERIC(10, 2) NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL
	);`

	_, err := db.Exec(query)
	if err != nil {
		log.Fatalf("Failed to execute database migrations: %v", err)
	}
	log.Println("PostgreSQL schema migration completed successfully.")
}

func handleOrders(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case "GET":
		getOrders(w, r)
	case "POST":
		createOrder(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
	}
}

func getOrders(w http.ResponseWriter, r *http.Request) {
	var orders []Order

	if isDbConnected {
		rows, err := db.Query("SELECT id, email, address, items, total, created_at FROM orders ORDER BY created_at DESC")
		if err != nil {
			log.Printf("Database fetch error: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Database read error"})
			return
		}
		defer rows.Close()

		for rows.Next() {
			var o Order
			var itemsStr string
			err := rows.Scan(&o.ID, &o.Email, &o.Address, &itemsStr, &o.Total, &o.CreatedAt)
			if err != nil {
				log.Printf("Row scan failure: %v", err)
				continue
			}

			// Unmarshal items string into structural interface
			var itemsObj interface{}
			json.Unmarshal([]byte(itemsStr), &itemsObj)
			o.Items = itemsObj
			
			orders = append(orders, o)
		}
	} else {
		// Thread-safe fetch from memory
		storeMutex.RLock()
		orders = make([]Order, len(memoryStore))
		copy(orders, memoryStore)
		storeMutex.RUnlock()
		
		// Sort order history in-memory descending
		for i, j := 0, len(orders)-1; i < j; i, j = i+1, j-1 {
			orders[i], orders[j] = orders[j], orders[i]
		}
	}

	if orders == nil {
		orders = []Order{}
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(orders)
}

func createOrder(w http.ResponseWriter, r *http.Request) {
	var o Order
	err := json.NewDecoder(r.Body).Decode(&o)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Malformed JSON payload"})
		return
	}

	if o.Email == "" || o.Address == "" || o.Total <= 0 {
		w.WriteHeader(http.StatusUnprocessableEntity)
		json.NewEncoder(w).Encode(map[string]string{"error": "Missing required fields: email, address, total"})
		return
	}

	// Generate primary key details
	o.ID = uuid.New().String()
	o.CreatedAt = time.Now()

	if isDbConnected {
		// Serialize cart items object to string to store as text in postgres
		itemsBytes, err := json.Marshal(o.Items)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to marshal item array"})
			return
		}

		query := `INSERT INTO orders (id, email, address, items, total, created_at) VALUES ($1, $2, $3, $4, $5, $6);`
		_, err = db.Exec(query, o.ID, o.Email, o.Address, string(itemsBytes), o.Total, o.CreatedAt)
		if err != nil {
			log.Printf("Failed to insert order to DB: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Database insert failed"})
			return
		}
		log.Printf("Successfully saved Order %s to PostgreSQL.", o.ID)
	} else {
		// Thread-safe save to memory cache
		storeMutex.Lock()
		memoryStore = append(memoryStore, o)
		storeMutex.Unlock()
		log.Printf("Successfully saved Order %s to local in-memory storage fallback.", o.ID)
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(o)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	dbStatus := "disconnected"
	if isDbConnected {
		dbStatus = "connected"
	}
	
	resp := map[string]interface{}{
		"status":    "healthy",
		"service":   "order-processing",
		"database":  dbStatus,
		"timestamp": time.Now().Format(time.RFC3339),
	}
	
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
