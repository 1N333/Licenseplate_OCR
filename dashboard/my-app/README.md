This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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

## Authentication

Open the app and choose **Sign up** to create an account, then use the same email and password to log in. Passwords must be at least 8 characters and are stored as scrypt hashes. User and session tables are created automatically in MySQL when authentication is first used.

## Vehicle records

After signing in, add, view, edit, search, or delete vehicle records. Each record includes license plate category, number and province, owner name and phone, vehicle brand, model and color, and an optional car photo (JPEG, PNG, or WebP up to 5 MB). The province selector groups all 77 provinces into Northern, Northeastern, Central (including Eastern and Western provinces), and Southern regions. Colors are grouped into neutral, vibrant, dark, earth-tone, pastel, and metallic categories. Brand and model fields provide searchable suggestions from the listed Japanese, Chinese, European, American, and Korean makes; both fields still accept custom text. Records and photos are limited to the signed-in account. Photos are stored locally under `data/uploads/cars` and are excluded from Git; include this folder in backups. For a multi-instance or hosted deployment, configure shared persistent file storage before using photo uploads.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
