import os
import logging
from typing import List, Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pymongo import MongoClient
import urllib.parse

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("product-catalog")

app = FastAPI(
    title="ZenithCart Product Catalog Service",
    description="Microservice managing e-commerce catalog storage using MongoDB",
    version="1.0.0"
)

# Enable CORS for local cross-origin development testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection configuration
MONGO_URI = os.getenv("MONGO_URI", "mongodb://catalog-db:27017")
DB_NAME = "catalog_db"
COLLECTION_NAME = "products"

# Initialize MongoDB client
try:
    logger.info(f"Connecting to MongoDB at {MONGO_URI}...")
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db = client[DB_NAME]
    products_collection = db[COLLECTION_NAME]
    # Trigger a connection attempt
    client.server_info()
    logger.info("MongoDB connection established successfully.")
except Exception as e:
    logger.error(f"Failed to connect to MongoDB: {e}")
    # Fallback client for test environments where MongoDB might not be running
    products_collection = None

# Pydantic Schemas for validation
class ProductBase(BaseModel):
    name: str = Field(..., example="Apex Pro Keyboard")
    desc: str = Field(..., example="OmniPoint mechanical switches with adjustable actuation")
    price: float = Field(..., gt=0.0, example=199.99)
    image: str = Field(..., example="https://images.unsplash.com/photo-1618384887929-16ec33faf9c1?q=80&w=400")
    tag: str = Field(default="New", example="Bestseller")

class ProductDB(ProductBase):
    id: str

# Default Seed Products
SEED_PRODUCTS = [
    {
        "id": "prod_001",
        "name": "Prism 34\" Ultrawide Monitor",
        "desc": "Stunning curved gaming monitor with a brilliant QD-OLED display, 240Hz refresh rate, and HDR1000 for immersive visuals.",
        "price": 849.99,
        "image": "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=400",
        "tag": "New"
    },
    {
        "id": "prod_002",
        "name": "Apex Pro Tactile Keyboard",
        "desc": "Ultra-fast mechanical gaming keyboard featuring adjustable magnetic switches, custom OLED display profile, and dynamic RGB.",
        "price": 199.99,
        "image": "https://images.unsplash.com/photo-1618384887929-16ec33faf9c1?q=80&w=400",
        "tag": "Bestseller"
    },
    {
        "id": "prod_003",
        "name": "Aero Sound ANC Headphones",
        "desc": "Hi-Res wireless audio headphones loaded with industry-leading Active Noise Cancellation and a robust 45-hour quick-charge battery.",
        "price": 289.99,
        "image": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=400",
        "tag": "Bestseller"
    },
    {
        "id": "prod_004",
        "name": "Titan Liquid Gaming PC",
        "desc": "Pre-built high-end computer tower armed with an RTX 4080 GPU, liquid-cooled Intel i9 processor, and glowing structural panel styling.",
        "price": 1999.99,
        "image": "https://images.unsplash.com/photo-1587831990711-23ca6441447b?q=80&w=400",
        "tag": "New"
    }
]

@app.on_event("startup")
def seed_database():
    """Seeds the catalog collection with default products if empty upon startup"""
    if products_collection is None:
        logger.warning("MongoDB is unavailable. Skipping database seeding.")
        return
    
    try:
        count = products_collection.count_documents({})
        if count == 0:
            logger.info("Product catalog collection is empty. Seeding catalog database...")
            products_collection.insert_many(SEED_PRODUCTS)
            logger.info(f"Successfully seeded {len(SEED_PRODUCTS)} items into MongoDB.")
        else:
            logger.info(f"Catalog database already contains {count} products. Skipping seeding.")
    except Exception as e:
        logger.error(f"Error seeding database: {e}")

@app.get("/products", response_model=List[ProductDB])
def get_products():
    """Retrieves all products from MongoDB"""
    if products_collection is None:
        # Fallback to seed products for headless testing
        return SEED_PRODUCTS
    
    try:
        cursor = products_collection.find({})
        products = []
        for doc in cursor:
            # Map MongoDB format into expected response JSON
            doc["id"] = str(doc.get("id", doc.get("_id")))
            if "_id" in doc:
                del doc["_id"]
            products.append(doc)
        return products
    except Exception as e:
        logger.error(f"Error fetching products: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error reading product storage."
        )

@app.post("/products", response_model=ProductDB, status_code=status.HTTP_201_CREATED)
def create_product(product: ProductBase):
    """Creates a new product item in the database"""
    if products_collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MongoDB service unavailable."
        )
    
    try:
        new_prod = product.dict()
        # Generate custom unique text id based on product name
        prod_id = "prod_" + urllib.parse.quote_plus(product.name.lower()[:15]).replace("%", "")
        new_prod["id"] = prod_id
        
        # Check if already exists
        if products_collection.find_one({"id": prod_id}):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Product with a similar name already exists."
            )
            
        products_collection.insert_one(new_prod)
        if "_id" in new_prod:
            del new_prod["_id"]
        return new_prod
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error creating product: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error writing product to storage."
        )

@app.get("/health")
def health_check():
    """Service health endpoint check"""
    mongo_status = "unhealthy"
    if products_collection is not None:
        try:
            client.admin.command('ping')
            mongo_status = "healthy"
        except Exception:
            pass
            
    return {
        "status": "healthy",
        "service": "product-catalog",
        "mongodb": mongo_status,
        "environment": os.getenv("ENV", "production")
    }
