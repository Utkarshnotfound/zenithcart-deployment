# =========================================================
# Stage 1: Compile the statically linked Go binary
# =========================================================
FROM golang:1.20-alpine AS builder

WORKDIR /usr/src/app

# Install git, required for retrieving external go packages if needed
RUN apk add --no-cache git

COPY go.mod ./
RUN go mod download

COPY . .

# Compile optimized, statically-linked binary (disabling CGO, stripping symbols)
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o order-service .

# =========================================================
# Stage 2: Clean runtime environment
# =========================================================
FROM alpine:latest

WORKDIR /app

# Copy the statically compiled binary from Stage 1
COPY --from=builder /usr/src/app/order-service .

EXPOSE 8003

# Health check using Alpine's native wget spider command
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8003/health || exit 1

CMD ["./order-service"]
