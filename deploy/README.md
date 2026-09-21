# Deploy (Hostinger VPS / any Ubuntu server with Docker)

```bash
# 1. server prep (once)
apt update && apt install -y docker.io docker-compose-v2 git
git clone https://github.com/dhadukmanish/DiamondTrading.git /opt/erp && cd /opt/erp
cp deploy/.env.prod.example .env && nano .env      # set DB_PASSWORD, JWT_SECRET, APP_URL

# 2. build + start
docker compose -f docker-compose.prod.yml up -d --build

# 3. create tables + seed (first time only)
docker compose -f docker-compose.prod.yml exec api npx drizzle-kit push
docker compose -f docker-compose.prod.yml exec api npx tsx src/db/seed.ts

# 4. update later
git pull && docker compose -f docker-compose.prod.yml up -d --build
```

HTTPS: point the domain's A record to the VPS, then put Caddy or certbot in front of port 80
(e.g. `apt install caddy`, Caddyfile: `erp.yourdomain.com { reverse_proxy localhost:80 }` and change web port to 8080).
Backups: `docker compose -f docker-compose.prod.yml exec db pg_dump -U erp erp > backup.sql`.
