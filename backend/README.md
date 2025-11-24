# Backend Docker Compose

## Cara Menjalankan

### Development dengan Docker

1. **Pastikan Docker dan Docker Compose sudah terinstall**

2. **Build dan jalankan containers:**
   ```bash
   docker-compose up -d
   ```

3. **Cek logs:**
   ```bash
   docker-compose logs -f backend
   ```

4. **Akses aplikasi:**
   - Backend API: http://localhost:3001
   - API Documentation: http://localhost:3001/api-docs
   - Health Check: http://localhost:3001/health

5. **Stop containers:**
   ```bash
   docker-compose down
   ```

6. **Stop dan hapus volumes (termasuk data database):**
   ```bash
   docker-compose down -v
   ```

### Development Lokal (tanpa Docker)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Setup environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` dan sesuaikan dengan konfigurasi Anda.

3. **Generate Prisma Client:**
   ```bash
   npm run prisma:generate
   ```

4. **Jalankan migrasi database:**
   ```bash
   npm run prisma:migrate
   ```

5. **Jalankan aplikasi:**
   ```bash
   npm run dev
   ```

## API Endpoints

### Details Management

- `GET /api/details` - Get all details (with pagination)
- `GET /api/details/:id` - Get detail by ID
- `POST /api/details` - Create new detail
- `PUT /api/details/:id` - Update detail
- `DELETE /api/details/:id` - Delete detail (soft delete)

### Documentation

- `GET /api-docs` - Swagger API Documentation
- `GET /health` - Health check endpoint

## Database Schema

Table: `Detail`
- `id` - Integer (Primary Key, Auto Increment)
- `latitude` - Float
- `longitude` - Float
- `address` - String (Optional)
- `environment` - JSON (Optional)
- `decision` - String (Optional)
- `explanation` - String (Optional)
- `status` - Enum (PENDING, PROCESSING, COMPLETED, FAILED)
- `createdAt` - DateTime
- `updatedAt` - DateTime
- `deletedAt` - DateTime (Optional, for soft delete)

## Environment Variables

```env
PORT=3001
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/civilconstruction?schema=public"
NODE_ENV=development
```

## Docker Commands Cheat Sheet

```bash
# Build image
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose stop

# Remove containers
docker-compose down

# Remove containers and volumes
docker-compose down -v

# Execute commands in container
docker-compose exec backend sh

# Run migrations in container
docker-compose exec backend npx prisma migrate deploy
```
