# Civil Construction Frontend

This is a [Next.js](https://nextjs.org) project for Civil Construction Application.

## Getting Started

### Development Lokal (tanpa Docker)

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Setup environment variables (opsional):**

   ```bash
   # Create .env.local file
   NEXT_PUBLIC_API_URL=http://localhost:3001/api
   ```

3. **Jalankan aplikasi:**

   ```bash
   npm run dev
   ```

4. **Build untuk production:**
   ```bash
   npm run build
   npm start
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

### Development dengan Docker

1. **Pastikan Docker dan Docker Compose sudah terinstall**

2. **Build dan jalankan container:**

   ```bash
   docker-compose up -d
   ```

3. **Cek logs:**

   ```bash
   docker-compose logs -f frontend
   ```

4. **Akses aplikasi:**
   - Frontend: http://localhost:3000

5. **Stop container:**
   ```bash
   docker-compose down
   ```

## Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## Docker Commands Cheat Sheet

```bash
# Build image
docker-compose build

# Start service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop service
docker-compose stop

# Remove container
docker-compose down

# Execute commands in container
docker-compose exec frontend sh

# Rebuild after code changes
docker-compose up -d --build
```

## Next.js Configuration

File `next.config.ts` sudah dikonfigurasi dengan `output: 'standalone'` untuk optimasi Docker deployment.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
