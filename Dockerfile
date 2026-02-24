# El Inmortal 2 Dashboard - Production Dockerfile
FROM node:20-bookworm-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p public/uploads && chmod 755 public/uploads

# Set environment
ENV NODE_ENV=production
ENV PORT=3100

# Expose port
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3100/api/health || exit 1

# Run application
CMD ["npm", "start"]
