FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /runner ./cmd/runner

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=builder /runner /runner

EXPOSE 9090

CMD ["/runner"]
