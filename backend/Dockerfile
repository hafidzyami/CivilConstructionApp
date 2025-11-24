# Stage 1: Build
FROM node:20-alpine AS builder

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
FROM node:20-alpine AS production

WORKDIR /app

# Set dummy DATABASE_URL for prisma.config.ts
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/civilconstruction?schema=public"

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install production dependencies only
RUN npm ci --only=production

# Generate Prisma Client in production (creates src/generated)
RUN npm run prisma:generate

# Copy built files from builder stage (only dist, NOT generated)
COPY --from=builder /app/dist ./dist

# Unset dummy DATABASE_URL (will be provided at runtime)
ENV DATABASE_URL=

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 6969

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:6969/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application with dumb-init
CMD ["dumb-init", "node", "dist/index.js"]
