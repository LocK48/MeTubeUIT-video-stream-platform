# MeTube — Video Streaming Platform

MeTube is a video sharing and streaming application built with React, Express, MongoDB, Redis, and FFmpeg. Users can upload videos, follow channels, watch processed streams, and receive notifications when subscribed channels publish new content.

## Features

- Account registration, sign-in, channel subscriptions, and user profiles.
- Direct browser-to-object-storage video uploads using short-lived presigned URLs.
- Background video processing with FFmpeg and HLS output.
- Object storage through an S3-compatible API. Cloudflare R2 is supported.
- MongoDB persistence, Redis-backed queues and events, and Socket.IO notifications.
- React single-page frontend served by Nginx in the production Docker setup.

## Architecture

```text
Browser ── API requests / Socket.IO ──> Nginx ──> Express API ──> MongoDB
   │                                        │            │
   └── presigned PUT ──> S3-compatible storage          └──> Redis
                                                        ▲      │
                                                        └──────┘
                                                      FFmpeg worker
```

1. The frontend asks the API for a presigned upload URL and uploads the raw video directly to object storage.
2. The API queues a processing job in Redis.
3. The worker downloads the raw object, transcodes it into HLS renditions, creates a thumbnail, and uploads the output.
4. The worker updates MongoDB and publishes a completion event through Redis.
5. The API notifies the uploader and subscribers through Socket.IO and the notifications API.

## Requirements

For Docker deployment:

- A Linux VPS with Docker Engine and the Docker Compose plugin.
- A reachable MongoDB instance (MongoDB Atlas or self-hosted).
- A Redis server reachable by the API and worker on TCP port `6379`.
- An S3-compatible object-storage account. This guide uses Cloudflare R2.
- A domain and TLS reverse proxy are recommended for production.

For local development, install Node.js 24 or newer for the frontend and Node.js 22 or newer for the API and worker. FFmpeg is included in the worker dependency tree.

## Cloudflare R2 setup

Create an R2 bucket, for example `metub-r2`, and create an R2 S3 API token with the read/write permissions the application needs. The application uses the S3-compatible access key ID and secret access key; the Cloudflare account ID is part of the endpoint URL and is not the access key.

Example endpoint:

```text
https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
```

Set all four bucket variables to the same bucket when using one bucket:

```dotenv
BUCKET_RAW_VIDEO=metub-r2
BUCKET_PROCESSED_VIDEO=metub-r2
BUCKET_ASSET=metub-r2
BUCKET_LOG=metub-r2
```

The application separates content with object-key prefixes inside the bucket, such as `raw-video/`, `processed-video/`, and `asset/avatar/`. These are key prefixes (similar to folders), not separate R2 buckets. The current app stores user-facing assets in R2; check the code before assuming that the log bucket variable is actively used.

Configure the R2 custom domain (for example, `https://metub.lock48.dpdns.org`) and set `PUBLIC_ASSET_URL` to that public base URL. Set `VITE_PROCESSED_STORAGE_URL` to the public base URL plus `/processed-video`, for example:

```dotenv
PUBLIC_ASSET_URL=https://metub.lock48.dpdns.org
VITE_PROCESSED_STORAGE_URL=https://metub.lock48.dpdns.org/processed-video
```

### R2 CORS

Allow browser requests from the **application website's origin** (the scheme, host, and optional port where the frontend is served). Do not use the R2 custom domain as the allowed origin unless the frontend itself is hosted on that same origin.

Use a policy along these lines, replacing the origin with your actual website URL:

```json
[
  {
    "AllowedOrigins": ["https://your-app.example.com"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "Range", "*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

For local development, add the Vite origin (usually `http://localhost:5173`) as a separate allowed origin. Avoid `*` for production origins. Browser uploads use a presigned `PUT` request, so the allowed methods must include `PUT`.

## MongoDB setup

Provide either a complete `MONGODB_URI`, or the connection pieces used by this project: `MONGODB_USER`, `MONGODB_PASSWORD`, `MONGODB_APPNAME_SALT`, and `MONGODB_APPNAME`. Prefer a MongoDB database user restricted to the application database. For Atlas, add the VPS's outbound IP address to the project's network access allowlist; avoid opening database access to every IP for production.

## Environment configuration

The repository intentionally does not include production `.env` files. Create these files on the deployment host; do not commit them:

- `api_server/.env`
- `worker_server/.env`
- `frontend/Metube-UI/.env` (only needed when building the frontend outside Docker; the Compose frontend build uses same-origin API routing)

### API: `api_server/.env`

```dotenv
PORT=8000
MONGODB_URI=<mongodb-connection-string>
REDIS_HOST=<redis-host-as-seen-from-the-container>
REDIS_PORT=6379
REDIS_PASSWORD=

ENDPOINT=https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
ACCESS_KEY_ID=<r2-s3-access-key-id>
SECRET_KEY=<r2-s3-secret-access-key>
BUCKET_RAW_VIDEO=metub-r2
BUCKET_PROCESSED_VIDEO=metub-r2
BUCKET_ASSET=metub-r2
BUCKET_LOG=metub-r2
PUBLIC_ASSET_URL=https://your-r2-custom-domain.example.com

JWT_SECRET=<long-random-secret>
SESSION_SECRET=<long-random-secret>
AES_SECRET_KEY=<application-encryption-secret>
```

### Worker: `worker_server/.env`

The worker needs the same MongoDB, Redis, and R2 settings as the API, including the same bucket names and credentials. `PUBLIC_ASSET_URL`, JWT, and session settings are API-side; the worker needs `AES_SECRET_KEY` to process existing encrypted metadata consistently.

```dotenv
PORT=8001
MONGODB_URI=<mongodb-connection-string>
REDIS_HOST=<redis-host-as-seen-from-the-container>
REDIS_PORT=6379
REDIS_PASSWORD=

ENDPOINT=https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
ACCESS_KEY_ID=<r2-s3-access-key-id>
SECRET_KEY=<r2-s3-secret-access-key>
BUCKET_RAW_VIDEO=metub-r2
BUCKET_PROCESSED_VIDEO=metub-r2
BUCKET_ASSET=metub-r2
BUCKET_LOG=metub-r2
AES_SECRET_KEY=<same-application-encryption-secret>
```

The S3 client uses `ACCESS_KEY_ID` and `SECRET_KEY`. `API_TOKEN` and `ACCESS_KEY_USER` are not substitutes for those S3 credentials in the application configuration.

### Frontend: `frontend/Metube-UI/.env`

For direct Vite development, configure the API origin and the public HLS URL:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
VITE_AES_SECRET_KEY=<same-application-encryption-secret>
VITE_PROCESSED_STORAGE_URL=https://your-r2-custom-domain.example.com/processed-video
```

In Docker Compose, the frontend is served by Nginx. It proxies `/metube/` and `/socket.io/` to the API, so users access the frontend and API through the same origin. The production frontend build does not require `VITE_API_BASE_URL`.

## Deploy with Docker Compose

The Compose file builds three containers: `api`, `worker`, and `frontend`. MongoDB and Redis remain external services. The frontend listens on host port `8080` by default; configure your firewall and reverse proxy accordingly.

1. Clone the repository on the VPS and enter the project directory.
2. Create and fill `api_server/.env` and `worker_server/.env` using the settings above. Keep secrets out of Git.
3. Start Redis on the VPS and confirm it listens on host TCP port `6379`.
4. Configure MongoDB network access to allow connections from the VPS.
5. Build and start the application:

   ```bash
   docker compose up -d --build
   ```

6. Check container state and logs:

   ```bash
   docker compose ps
   docker compose logs -f api worker
   ```

7. Open `http://<VPS-IP>:8080`, or route your website domain to this port through a TLS reverse proxy.

The Compose file maps `host.docker.internal` to the Docker host gateway and sets that as the Redis host by default. This lets API and worker containers reach a Redis container that publishes port `6379` on the host. You can override this default by setting `REDIS_HOST` in the Compose environment. Ensure the existing Redis container is running before starting the application. Redis must not be exposed publicly without authentication and firewall restrictions; restrict port `6379` to trusted traffic.

To stop the application containers:

```bash
docker compose down
```

This does not stop or remove the separate MongoDB or Redis services.

### Production networking notes

- Only publish the frontend port. API port `8000` is internal to the Compose network.
- Terminate HTTPS at a reverse proxy such as Caddy, Nginx, or Traefik and forward requests to port `8080`.
- Configure R2 CORS with the public frontend origin, including `https://` and the correct hostname.
- Allow the VPS to make outbound connections to MongoDB and Cloudflare R2.
- Keep `.env` files readable only by the deployment user and never commit them.

## Run locally without Docker

Install dependencies:

```bash
npm ci --prefix api_server
npm ci --prefix worker_server
npm ci --prefix frontend/Metube-UI
```

Create the API and worker `.env` files as described above, using a Redis hostname reachable from the host (commonly `localhost`). Set the frontend `.env` for the local API and R2 public media URL. Then start each service in a separate terminal:

```bash
npm --prefix api_server start
npm --prefix worker_server start
npm --prefix frontend/Metube-UI start -- --host 0.0.0.0
```

The Vite development server normally uses `http://localhost:5173`; the API defaults to port `8000`.

## Useful commands

```bash
# Build production images
docker compose build

# Start or update the stack
docker compose up -d --build

# Follow API and worker logs
docker compose logs -f api worker

# Check running services
docker compose ps

# Stop Compose-managed services
docker compose down
```

## Troubleshooting

- **Redis connection refused:** verify Redis is running, listening on host port `6379`, and `REDIS_HOST` resolves from inside the application containers. The Compose default is `host.docker.internal` mapped to the Docker host gateway.
- **MongoDB connection timeout:** check the URI, database credentials, MongoDB network allowlist, and VPS outbound IP.
- **R2 authorization errors:** use the R2 S3 access key ID and secret, account-specific S3 endpoint, and a token with access to the target bucket.
- **Browser upload CORS error:** allow the frontend website origin and the `PUT` method in the bucket's CORS policy. A custom media domain is not automatically the website origin.
- **HLS or thumbnail URLs fail:** confirm the bucket custom domain is public and `PUBLIC_ASSET_URL` / `VITE_PROCESSED_STORAGE_URL` use the correct domain and `processed-video` prefix.
- **Socket.IO does not connect behind a proxy:** ensure the proxy forwards WebSocket upgrade headers for `/socket.io/`.
- **Large uploads fail at Nginx:** the bundled Nginx configuration sets a 16 MB request limit. Video bytes upload directly to R2; increase this limit only if your application sends larger files through Nginx.

## Security

- Do not commit `.env` files, API tokens, storage keys, database credentials, or signing secrets.
- Use least-privilege credentials for MongoDB and R2.
- Set strong, unique values for `JWT_SECRET`, `SESSION_SECRET`, and `AES_SECRET_KEY`.
- Restrict Redis and MongoDB network access to trusted hosts.
- Use HTTPS for the public application and configure R2 CORS for only the required frontend origins.

## License

See the repository's license file, if provided.
