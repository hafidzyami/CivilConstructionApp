# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Set dummy DATABASE_URL for prisma.config.ts during build
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/civilconstruction?schema=public"

# Copy package files and prisma schema
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma Client first (creates src/generated folder)
RUN npm run prisma:generate

# Now copy source code after Prisma Client is generated
COPY tsconfig.json ./
COPY src ./src

# Build application (TypeScript can now find generated Prisma types)
RUN npm run build

# Stage 2: Production
FROM node:22-slim AS production

WORKDIR /app

# Set dummy DATABASE_URL for prisma.config.ts
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/civilconstruction?schema=public"

# Install system dependencies for Python and OCR
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    dumb-init \
    # OpenCV dependencies
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    # For PaddlePaddle
    libgfortran5 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install ALL deps (needed for prisma generate), Generate, then Prune to production only
RUN npm ci && \
    npm run prisma:generate && \
    npm prune --production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy OCR source files
COPY src/ocr ./src/ocr

# Install Python dependencies for OCR
RUN pip3 install --no-cache-dir -r src/ocr/requirements.txt

# Unset dummy DATABASE_URL (will be provided at runtime)
ENV DATABASE_URL=

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/bash nodejs

RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 6969

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:6969/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application with dumb-init
CMD ["dumb-init", "node", "dist/index.js"]
