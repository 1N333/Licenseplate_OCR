This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

For end-user instructions in Thai, see the [user guide](./USER_GUIDE.md).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## MySQL with Docker Desktop

1. Make sure Docker Desktop is running.
2. Copy `.env.example` to `.env` and change the local passwords if needed:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Start MySQL:

   ```bash
   docker compose up -d
   ```

4. Start the app with `npm run dev`.
5. Check the connection at [http://localhost:3000/api/db/health](http://localhost:3000/api/db/health). A successful response is `{"status":"ok"}`.

The database is available on `127.0.0.1:3306` and its data persists in the `mysql_data` Docker volume. Use environment variables from `.env` when configuring another MySQL instance. The example passwords are for local development only; never use them in production.

The shareable table definitions are in [`database/schema.sql`](./database/schema.sql). Import this file into the selected MySQL database to create the tables without copying any user or vehicle records. Keep database exports containing real records and `.env` files out of GitHub.

## Authentication

Public account registration is disabled. Existing accounts continue to sign in with their email and password. On first startup, existing accounts receive the `guard` role by default; an authorized operator can assign an existing account to `office` or `guard` from this directory:

```powershell
npm run set-role -- user@example.com office
```

Use `guard` instead of `office` for security staff. The command only changes the role of an existing account; it does not create accounts. Roles are enforced by the API as well as the interface. Office accounts can create, view, update, and delete their own vehicle records. Guard accounts can view the dashboard and detection history only.

## Vehicle records

Office staff can add, view, edit, search, or delete vehicle records. Each record includes license plate category, number and province, owner name and phone, vehicle brand, model and color, and an optional car photo (JPEG, PNG, or WebP up to 5 MB). The province selector groups all 77 provinces into Northern, Northeastern, Central (including Eastern and Western provinces), and Southern regions. Colors are grouped into neutral, vibrant, dark, earth-tone, pastel, and metallic categories. Brand and model fields provide searchable suggestions from the listed Japanese, Chinese, European, American, and Korean makes; both fields still accept custom text. Records and photos are limited to the signed-in office account. Photos are stored locally under `data/uploads/cars` and are excluded from Git; include this folder in backups. For a multi-instance or hosted deployment, configure shared persistent file storage before using photo uploads.

## License plate entry and exit detections

The dashboard displays vehicle detections reported by a Raspberry Pi and refreshes the newest page every five seconds. The history is sorted newest first and paginated at 10 events per page. Both roles can view this shared detection history. To enable ingestion and match plates against the office account's vehicle records, set `PLATE_API_KEY` to a random secret of at least 16 characters and set `PLATE_OWNER_EMAIL` to the office account's email, then restart Next.js. The first request creates the detections table automatically.

Send multipart form data to `POST /api/detections` with the `X-API-Key` header and `plate`, `direction` (`in`/`out` or `เข้า`/`ออก`), and `device` fields. The optional `time`, `province`, and `image` fields are also accepted; images must be JPEG or PNG and no larger than 5 MB. Detection records belong to the configured account and are matched against that account's vehicle records. Signed-in dashboards read the history from `GET /api/detections`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
