# syntax=docker/dockerfile:1

# ---- deps: instala TODAS las dependencias (incl. devDependencies) para compilar ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compila TypeScript -> dist/ ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- prod-deps: instala SOLO dependencias de producción (sin TypeScript, ESLint, Vitest, etc.) ----
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime: imagen final, mínima, sin herramientas de build ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Usuario no-root: si el contenedor se ve comprometido, el proceso no corre como root.
RUN addgroup -S app && adduser -S app -G app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER app

ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--help"]
