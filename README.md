# Civil Construction Application

Aplikasi manajemen konstruksi sipil dengan backend Express.js, frontend Next.js, dan database PostgreSQL.

## 🏗️ Arsitektur

- **Backend**: Express.js + TypeScript + Prisma ORM
- **Frontend**: Next.js 16 + React 19 + TypeScript
- **Database**: PostgreSQL 16
- **Containerization**: Docker & Docker Compose

## 📋 Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2.0+)
- [Node.js](https://nodejs.org/) (v20+) - untuk development lokal
- [npm](https://www.npmjs.com/) atau [yarn](https://yarnpkg.com/) - untuk development lokal

## 🚀 Quick Start

### Menggunakan Docker (Recommended)

1. **Clone repository:**
   ```bash
   git clone <repository-url>
   cd CivilConstructionApp
   ```

2. **Setup environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env dan isi dengan nilai yang sesuai
   ```

3. **Jalankan semua services (Database + Backend + Frontend):**
   ```bash
   docker-compose up -d
   ```

4. **Akses aplikasi:**
   - Frontend: http://localhost:6968
   - Backend API: http://localhost:6969
   - API Documentation: http://localhost:6969/api-docs
   - PostgreSQL: localhost:6967

5. **Cek logs:**
   ```bash
   # Semua services
   docker-compose logs -f

   # Service tertentu
   docker-compose logs -f backend
   docker-compose logs -f frontend
   docker-compose logs -f postgres
   ```

6. **Stop semua services:**
   ```bash
   docker-compose down
   ```

7. **Stop dan hapus data (termasuk database):**
   ```bash
   docker-compose down -v
   ```

### Development Lokal (Tanpa Docker)

#### Backend

1. **Navigate ke folder backend:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Setup environment:**
   ```bash
   cp .env.example .env
   # Edit .env sesuai konfigurasi
   ```

4. **Generate Prisma Client:**
   ```bash
   npm run prisma:generate
   ```

5. **Run database migration:**
   ```bash
   npm run prisma:migrate
   ```

6. **Start development server:**
   ```bash
   npm run dev
   ```

#### Frontend

1. **Navigate ke folder frontend:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Setup environment (optional):**
   ```bash
   cp .env.example .env.local
   # Edit .env.local sesuai konfigurasi
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

## 📚 API Documentation

Swagger documentation tersedia di: http://localhost:3001/api-docs

### API Endpoints

#### Details Management

- `GET /api/details` - Get all details (with pagination)
  - Query params: `page` (default: 1), `limit` (default: 10)
- `GET /api/details/:id` - Get detail by ID
- `POST /api/details` - Create new detail
- `PUT /api/details/:id` - Update detail
- `DELETE /api/details/:id` - Delete detail (soft delete)

#### Health Check

- `GET /health` - Backend health status

### Request/Response Examples

**Create Detail:**
```json
POST /api/details
{
  "latitude": -6.2088,
  "longitude": 106.8456,
  "address": "Jakarta",
  "environment": {
    "temperature": 28,
    "humidity": 75
  },
  "decision": "Approved",
  "explanation": "Location suitable for construction",
  "status": "PENDING"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "latitude": -6.2088,
    "longitude": 106.8456,
    "address": "Jakarta",
    "environment": {...},
    "decision": "Approved",
    "explanation": "Location suitable for construction",
    "status": "PENDING",
    "createdAt": "2024-11-24T10:00:00Z",
    "updatedAt": "2024-11-24T10:00:00Z",
    "deletedAt": null
  },
  "message": "Detail created successfully"
}
```

## 🗄️ Database Schema

### Table: Detail

| Column | Type | Description |
|--------|------|-------------|
| id | Integer | Primary Key (Auto Increment) |
| latitude | Float | Latitude coordinate |
| longitude | Float | Longitude coordinate |
| address | String | Address (Optional) |
| environment | JSON | Environment data (Optional) |
| decision | String | Decision (Optional) |
| explanation | String | Explanation (Optional) |
| status | Enum | PENDING, PROCESSING, COMPLETED, FAILED |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |
| deletedAt | DateTime | Deletion timestamp (Optional) |

## 🐳 Docker Commands

```bash
# Build semua images
docker-compose build

# Build ulang tanpa cache
docker-compose build --no-cache

# Start semua services
docker-compose up -d

# Start service tertentu
docker-compose up -d backend

# Restart service
docker-compose restart backend

# View logs
docker-compose logs -f

# Execute command di container
docker-compose exec backend sh
docker-compose exec postgres psql -U postgres -d civilconstruction

# Stop semua services
docker-compose stop

# Remove containers
docker-compose down

# Remove containers dan volumes
docker-compose down -v

# Check status
docker-compose ps
```

## 🔧 Environment Variables

**Root Level (.env)**

```env
# PostgreSQL Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=civilconstruction
POSTGRES_PORT=6967

# Backend Configuration
BACKEND_PORT=6969
NODE_ENV=production

# Frontend Configuration
FRONTEND_PORT=6968
NEXT_PUBLIC_API_URL=http://localhost:6969/api
```

### Backend (.env)

```env
PORT=6969
DATABASE_URL="postgresql://postgres:your_password@localhost:6967/civilconstruction?schema=public"
NODE_ENV=development
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:6969/api
```

**⚠️ Security Note:**
- Jangan commit file `.env` ke repository
- Gunakan `.env.example` sebagai template
- Ganti semua password dengan nilai yang aman
- File `.env` sudah ada di `.gitignore`

## 📁 Project Structure

```
CivilConstructionApp/
├── backend/
│   ├── src/
│   │   ├── config/          # Configuration files
│   │   ├── controllers/     # Request handlers
│   │   ├── routes/          # API routes
│   │   ├── schemas/         # Validation schemas
│   │   ├── services/        # Business logic
│   │   ├── lib/             # Utilities & Prisma client
│   │   └── index.ts         # Entry point
│   ├── prisma/
│   │   └── schema.prisma    # Database schema
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── package.json
├── frontend/
│   ├── app/                 # Next.js App Router
│   ├── public/              # Static files
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── package.json
├── docker-compose.yml       # Full stack orchestration
└── README.md
```

## 🔨 Development Workflow

1. **Make changes** to code
2. **Rebuild containers** if needed:
   ```bash
   docker-compose up -d --build
   ```
3. **Run migrations** after schema changes:
   ```bash
   docker-compose exec backend npx prisma migrate dev
   ```
4. **View logs** to debug:
   ```bash
   docker-compose logs -f backend
   ```

## 📝 Notes

- Database migrations akan otomatis dijalankan saat backend container start
- Soft delete digunakan untuk menghapus data (field `deletedAt`)
- Health checks dikonfigurasi untuk semua services
- Multi-stage builds digunakan untuk optimasi image size
- Prisma Client sudah dikonfigurasi untuk custom output path

## 🤝 Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Troubleshooting

### Container tidak bisa start
```bash
# Check logs
docker-compose logs

# Remove dan rebuild
docker-compose down -v
docker-compose up -d --build
```

### Database connection error
```bash
# Check if postgres is ready
docker-compose exec postgres pg_isready -U postgres

# Check DATABASE_URL environment variable
docker-compose exec backend env | grep DATABASE_URL
```

### Port sudah digunakan
```bash
# Check ports in use
netstat -ano | findstr :6968
netstat -ano | findstr :6969
netstat -ano | findstr :6967

# Kill process atau ubah port di docker-compose.yml
```
