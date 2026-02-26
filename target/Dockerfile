FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Generate self-signed certs if not present
RUN chmod +x certs/generate-cert.sh && sh certs/generate-cert.sh

EXPOSE 3001 3443

CMD ["node", "dist/index.js"]
